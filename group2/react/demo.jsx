import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Camera, AlertTriangle, Clock, Package, Globe } from 'lucide-react';

// Hybrid Logical Clock implementation
class HybridLogicalClock {
  constructor(nodeId, initialTime = 0) {
    this.nodeId = nodeId;
    this.physicalTime = initialTime;
    this.logicalTime = 0;
  }

  tick() {
    this.physicalTime = Date.now();
    this.logicalTime = Math.max(this.logicalTime, this.physicalTime) + 1;
    return { physical: this.physicalTime, logical: this.logicalTime };
  }

  update(receivedPhysical, receivedLogical) {
    this.physicalTime = Date.now();
    this.logicalTime = Math.max(
      Math.max(this.logicalTime, this.physicalTime),
      receivedLogical
    ) + 1;
    return { physical: this.physicalTime, logical: this.logicalTime };
  }

  compare(otherClock) {
    if (this.logicalTime < otherClock.logical) return -1;
    if (this.logicalTime > otherClock.logical) return 1;
    if (this.physicalTime < otherClock.physical) return -1;
    if (this.physicalTime > otherClock.physical) return 1;
    return this.nodeId.localeCompare(otherClock.nodeId);
  }
}

// Message class for inter-node communication
class Message {
  constructor(type, data, sender, receiver, timestamp) {
    this.type = type;
    this.data = data;
    this.sender = sender;
    this.receiver = receiver;
    this.timestamp = timestamp;
    this.id = Math.random().toString(36).substr(2, 9);
  }
}

// Node representing a regional tracking center
class TrackingNode {
  constructor(id, region, latency = 100) {
    this.id = id;
    this.region = region;
    this.latency = latency;
    this.clock = new HybridLogicalClock(id);
    this.packages = new Map();
    this.messageQueue = [];
    this.inFlightMessages = [];
    this.eventLog = [];
    this.isSnapshotting = false;
    this.snapshotState = null;
    this.snapshotMessages = [];
  }

  // Process a package event locally
  processPackageEvent(packageId, event, location) {
    const timestamp = this.clock.tick();
    const eventRecord = {
      packageId,
      event,
      location,
      timestamp,
      nodeId: this.id,
      region: this.region
    };

    if (!this.packages.has(packageId)) {
      this.packages.set(packageId, []);
    }
    this.packages.get(packageId).push(eventRecord);
    this.eventLog.push(eventRecord);

    return eventRecord;
  }

  // Send message to another node
  sendMessage(message, network) {
    const timestampedMessage = {
      ...message,
      timestamp: this.clock.tick(),
      sentAt: Date.now()
    };
    
    // Add to in-flight messages with simulated network delay
    setTimeout(() => {
      network.deliverMessage(timestampedMessage);
    }, this.latency + Math.random() * 50);

    this.inFlightMessages.push(timestampedMessage);
    return timestampedMessage;
  }

  // Receive and process message
  receiveMessage(message) {
    const receivedTimestamp = this.clock.update(
      message.timestamp.physical,
      message.timestamp.logical
    );

    // Remove from in-flight messages
    this.inFlightMessages = this.inFlightMessages.filter(
      msg => msg.id !== message.id
    );

    // Process the message based on type
    switch (message.type) {
      case 'PACKAGE_UPDATE':
        this.processRemotePackageUpdate(message.data, receivedTimestamp);
        break;
      case 'SNAPSHOT_REQUEST':
        this.handleSnapshotRequest(message.sender);
        break;
      case 'SNAPSHOT_RESPONSE':
        this.handleSnapshotResponse(message.data);
        break;
    }

    this.eventLog.push({
      type: 'MESSAGE_RECEIVED',
      message,
      timestamp: receivedTimestamp,
      nodeId: this.id
    });
  }

  // Process package update from remote node
  processRemotePackageUpdate(packageData, timestamp) {
    if (!this.packages.has(packageData.packageId)) {
      this.packages.set(packageData.packageId, []);
    }
    
    const remoteEvent = {
      ...packageData,
      timestamp,
      isRemote: true
    };
    
    this.packages.get(packageData.packageId).push(remoteEvent);
  }

  // Initiate Chandy-Lamport snapshot
  initiateSnapshot() {
    this.isSnapshotting = true;
    this.snapshotState = {
      timestamp: this.clock.tick(),
      packages: new Map(this.packages),
      inFlightMessages: [...this.inFlightMessages]
    };
    this.snapshotMessages = [];
    
    return this.snapshotState;
  }

  // Handle snapshot request from coordinator
  handleSnapshotRequest(coordinator) {
    const snapshot = this.initiateSnapshot();
    return {
      nodeId: this.id,
      state: snapshot,
      inFlightMessages: this.inFlightMessages
    };
  }

  getPackageHistory(packageId) {
    return this.packages.get(packageId) || [];
  }
}

// Network simulation for message passing
class Network {
  constructor() {
    this.nodes = new Map();
    this.messageQueue = [];
    this.deliveredMessages = [];
  }

  addNode(node) {
    this.nodes.set(node.id, node);
  }

  deliverMessage(message) {
    const targetNode = this.nodes.get(message.receiver);
    if (targetNode) {
      targetNode.receiveMessage(message);
      this.deliveredMessages.push(message);
    }
  }

  broadcast(sender, message) {
    for (const [nodeId, node] of this.nodes) {
      if (nodeId !== sender.id) {
        const broadcastMessage = new Message(
          message.type,
          message.data,
          sender.id,
          nodeId,
          message.timestamp
        );
        sender.sendMessage(broadcastMessage, this);
      }
    }
  }
}

// Anomaly detector
class AnomalyDetector {
  constructor() {
    this.anomalies = [];
  }

  detectAnomalies(nodes) {
    const newAnomalies = [];
    
    // Check for temporal inconsistencies
    for (const [nodeId, node] of nodes) {
      for (const [packageId, events] of node.packages) {
        const sortedEvents = events.sort((a, b) => 
          a.timestamp.logical - b.timestamp.logical
        );
        
        for (let i = 1; i < sortedEvents.length; i++) {
          const prev = sortedEvents[i - 1];
          const curr = sortedEvents[i];
          
          // Check for impossible sequences (arrival before departure)
          if (prev.event === 'ARRIVED' && curr.event === 'DEPARTED' && 
              prev.nodeId !== curr.nodeId) {
            newAnomalies.push({
              type: 'TEMPORAL_INCONSISTENCY',
              packageId,
              description: `Package ${packageId} arrived at ${prev.region} before departing from ${curr.region}`,
              events: [prev, curr],
              severity: 'HIGH',
              timestamp: Date.now()
            });
          }
          
          // Check for clock drift (large physical time differences with close logical times)
          if (Math.abs(curr.timestamp.logical - prev.timestamp.logical) < 5 &&
              Math.abs(curr.timestamp.physical - prev.timestamp.physical) > 10000) {
            newAnomalies.push({
              type: 'CLOCK_DRIFT',
              packageId,
              description: `Significant clock drift detected between ${prev.region} and ${curr.region}`,
              events: [prev, curr],
              severity: 'MEDIUM',
              timestamp: Date.now()
            });
          }
        }
      }
    }
    
    this.anomalies.push(...newAnomalies);
    return newAnomalies;
  }

  getRecentAnomalies(limit = 10) {
    return this.anomalies
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

// Main simulation component
const DistributedTrackingSystem = () => {
  const [nodes, setNodes] = useState(new Map());
  const [network, setNetwork] = useState(new Network());
  const [anomalyDetector, setAnomalyDetector] = useState(new AnomalyDetector());
  const [isRunning, setIsRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [events, setEvents] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [globalSnapshot, setGlobalSnapshot] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState('');
  const intervalRef = useRef(null);

  // Initialize system
  useEffect(() => {
    const newNetwork = new Network();
    const newNodes = new Map();
    
    // Create regional nodes
    const regions = [
      { id: 'EU-1', region: 'Europe', latency: 120 },
      { id: 'US-1', region: 'US-East', latency: 80 },
      { id: 'APAC-1', region: 'Asia-Pacific', latency: 150 }
    ];
    
    regions.forEach(config => {
      const node = new TrackingNode(config.id, config.region, config.latency);
      newNodes.set(config.id, node);
      newNetwork.addNode(node);
    });
    
    setNodes(newNodes);
    setNetwork(newNetwork);
    setAnomalyDetector(new AnomalyDetector());
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Simulation step
  const simulationStep = () => {
    const nodeArray = Array.from(nodes.values());
    const packageIds = ['P001', 'P002', 'P003', 'P004', 'P005'];
    const eventTypes = ['DEPARTED', 'IN_TRANSIT', 'ARRIVED'];
    
    // Simulate random package events
    if (Math.random() < 0.7) {
      const randomNode = nodeArray[Math.floor(Math.random() * nodeArray.length)];
      const randomPackage = packageIds[Math.floor(Math.random() * packageIds.length)];
      const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const location = `${randomNode.region}-Hub-${Math.floor(Math.random() * 3) + 1}`;
      
      const eventRecord = randomNode.processPackageEvent(randomPackage, randomEvent, location);
      
      // Broadcast update to other nodes
      const updateMessage = new Message(
        'PACKAGE_UPDATE',
        eventRecord,
        randomNode.id,
        null,
        eventRecord.timestamp
      );
      
      network.broadcast(randomNode, updateMessage);
    }
    
    // Collect all events for timeline
    const allEvents = [];
    nodes.forEach(node => {
      allEvents.push(...node.eventLog.slice(-50)); // Keep recent events
    });
    
    setEvents(allEvents.sort((a, b) => a.timestamp?.logical - b.timestamp?.logical));
    
    // Detect anomalies
    const newAnomalies = anomalyDetector.detectAnomalies(nodes);
    if (newAnomalies.length > 0) {
      setAnomalies(prev => [...newAnomalies, ...prev.slice(0, 19)]);
    }
    
    setCurrentTime(prev => prev + 1);
  };

  // Control functions
  const startSimulation = () => {
    setIsRunning(true);
    intervalRef.current = setInterval(simulationStep, 1000);
  };

  const pauseSimulation = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const resetSimulation = () => {
    pauseSimulation();
    setCurrentTime(0);
    setEvents([]);
    setAnomalies([]);
    setGlobalSnapshot(null);
    
    // Reset all nodes
    nodes.forEach(node => {
      node.packages.clear();
      node.eventLog = [];
      node.inFlightMessages = [];
    });
  };

  // Take global snapshot
  const takeSnapshot = () => {
    const snapshot = {
      timestamp: Date.now(),
      nodes: {},
      inFlightMessages: []
    };
    
    nodes.forEach(node => {
      const nodeSnapshot = node.initiateSnapshot();
      snapshot.nodes[node.id] = {
        region: node.region,
        packages: Object.fromEntries(nodeSnapshot.packages),
        clockTime: nodeSnapshot.timestamp,
        inFlightCount: nodeSnapshot.inFlightMessages.length
      };
      snapshot.inFlightMessages.push(...nodeSnapshot.inFlightMessages);
    });
    
    setGlobalSnapshot(snapshot);
  };

  // Get package timeline
  const getPackageTimeline = (packageId) => {
    const timeline = [];
    nodes.forEach(node => {
      const history = node.getPackageHistory(packageId);
      timeline.push(...history);
    });
    return timeline.sort((a, b) => a.timestamp?.logical - b.timestamp?.logical);
  };

  const regionColors = {
    'Europe': 'bg-blue-100 border-blue-300',
    'US-East': 'bg-green-100 border-green-300',
    'Asia-Pacific': 'bg-purple-100 border-purple-300'
  };

  const eventColors = {
    'DEPARTED': 'text-red-600',
    'IN_TRANSIT': 'text-yellow-600',
    'ARRIVED': 'text-green-600'
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Globe className="text-blue-600" />
          Distributed Package Tracking System
        </h1>
        <p className="text-gray-600">
          Demonstrating time synchronization, global snapshots, and anomaly detection across distributed nodes
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={isRunning ? pauseSimulation : startSimulation}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                isRunning 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {isRunning ? <Pause size={16} /> : <Play size={16} />}
              {isRunning ? 'Pause' : 'Start'} Simulation
            </button>
            
            <button
              onClick={resetSimulation}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-500 hover:bg-gray-600 text-white"
            >
              <RotateCcw size={16} />
              Reset
            </button>
            
            <button
              onClick={takeSnapshot}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-blue-500 hover:bg-blue-600 text-white"
            >
              <Camera size={16} />
              Take Snapshot
            </button>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Clock size={16} />
              Simulation Time: {currentTime}
            </div>
            <div>Events: {events.length}</div>
            <div className="flex items-center gap-1 text-red-600">
              <AlertTriangle size={16} />
              Anomalies: {anomalies.length}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Regional Nodes */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Regional Tracking Nodes</h2>
          
          {Array.from(nodes.values()).map(node => {
            const recentEvents = node.eventLog.slice(-5);
            const packageCount = node.packages.size;
            const inFlightCount = node.inFlightMessages.length;
            
            return (
              <div key={node.id} className={`rounded-lg border-2 p-4 ${regionColors[node.region]}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{node.id} - {node.region}</h3>
                    <p className="text-sm text-gray-600">
                      Logical Clock: {node.clock.logicalTime} | Physical: {new Date(node.clock.physicalTime).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1">
                      <Package size={14} />
                      {packageCount} packages tracked
                    </div>
                    <div className="text-gray-500">{inFlightCount} messages in-flight</div>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-gray-700">Recent Events:</h4>
                  {recentEvents.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No recent events</p>
                  ) : (
                    recentEvents.map((event, idx) => (
                      <div key={idx} className="text-xs p-2 bg-white/50 rounded border">
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${eventColors[event.event] || 'text-gray-600'}`}>
                            {event.packageId} - {event.event}
                          </span>
                          <span className="text-gray-500">
                            {event.timestamp?.logical || 'N/A'}
                          </span>
                        </div>
                        {event.location && (
                          <div className="text-gray-600 mt-1">@ {event.location}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Side Panel */}
        <div className="space-y-4">
          {/* Anomalies */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="text-red-500" size={20} />
              Anomalies Detected
            </h3>
            
            {anomalies.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No anomalies detected</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {anomalies.slice(0, 10).map((anomaly, idx) => (
                  <div key={idx} className={`p-3 rounded border-l-4 ${
                    anomaly.severity === 'HIGH' ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'
                  }`}>
                    <div className="text-sm font-medium text-gray-900">{anomaly.type}</div>
                    <div className="text-xs text-gray-600 mt-1">{anomaly.description}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(anomaly.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global Snapshot */}
          {globalSnapshot && (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Camera className="text-blue-500" size={20} />
                Global Snapshot
              </h3>
              
              <div className="text-sm text-gray-600 mb-3">
                Taken at: {new Date(globalSnapshot.timestamp).toLocaleTimeString()}
              </div>
              
              <div className="space-y-2">
                {Object.entries(globalSnapshot.nodes).map(([nodeId, data]) => (
                  <div key={nodeId} className="p-2 bg-gray-50 rounded">
                    <div className="font-medium text-gray-900">{nodeId}</div>
                    <div className="text-xs text-gray-600">
                      {Object.keys(data.packages).length} packages | 
                      {data.inFlightCount} in-flight messages
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-3 pt-3 border-t">
                <div className="text-sm text-gray-600">
                  Total in-flight messages: {globalSnapshot.inFlightMessages.length}
                </div>
              </div>
            </div>
          )}

          {/* Package Timeline */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Package Timeline</h3>
            
            <div className="mb-3">
              <select
                value={selectedPackage}
                onChange={(e) => setSelectedPackage(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                <option value="">Select a package...</option>
                {['P001', 'P002', 'P003', 'P004', 'P005'].map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
            
            {selectedPackage && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {getPackageTimeline(selectedPackage).map((event, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded border-l-4 border-blue-400">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${eventColors[event.event]}`}>
                        {event.event}
                      </span>
                      <span className="text-xs text-gray-500">
                        LC: {event.timestamp?.logical}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {event.region} - {event.location}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event Timeline */}
      <div className="mt-6 bg-white rounded-lg shadow-sm border p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Event Timeline</h3>
        
        {events.length === 0 ? (
          <p className="text-gray-500 italic">No events recorded yet. Start the simulation to see activity.</p>
        ) : (
          <div className="max-h-40 overflow-y-auto">
            <div className="space-y-1">
              {events.slice(-20).map((event, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gray-500 min-w-[60px]">
                      LC:{event.timestamp?.logical || 'N/A'}
                    </span>
                    <span className="text-gray-600 min-w-[80px]">{event.region}</span>
                    {event.packageId && (
                      <span className="font-medium">{event.packageId}</span>
                    )}
                    <span className={eventColors[event.event] || 'text-gray-600'}>
                      {event.event || event.type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {event.timestamp?.physical ? new Date(event.timestamp.physical).toLocaleTimeString() : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DistributedTrackingSystem;