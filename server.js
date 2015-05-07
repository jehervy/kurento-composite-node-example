var kurento = require('kurento-client');
var express = require('express');
var app = express();
var path = require('path');
var wsm = require('ws');

app.set('port', process.env.PORT || 8080);

/*
 * Definition of constants
 */

// Modify here the kurento media server address
const ws_uri = "ws://localhost:8888/kurento";

/*
 * Definition of global variables.
 */

var composite = null;
var mediaPipeline = null;

var idCounter = 0;
var clients = {};
var kurentoClient = null;

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}
/*
 * Server startup
 */

var port = app.get('port');
var server = app.listen(port, function()
{
    console.log('Mixing stream server started');
    console.log('Connect to http://<host_name>:' + port + '/');
});

var WebSocketServer = wsm.Server;
var wss = new WebSocketServer(
    {
        server : server,
        path : '/call'
    }
);

/*
 * Management of WebSocket messages
 */
wss.on('connection', function(ws)
{
    var sessionId = nextUniqueId();

    console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error)
    {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function()
    {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    ws.on('message', function(_message)
    {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message.id);

        switch (message.id)
        {
            case 'client':
                addClient(sessionId, message.sdpOffer, function(error, sdpAnswer) {
                    if (error) {
                        return ws.send(JSON.stringify({
                            id : 'response',
                            response : 'rejected',
                            message : error
                        }));
                    }
                    ws.send(JSON.stringify({
                        id : 'response',
                        response : 'accepted',
                        sdpAnswer : sdpAnswer
                    }));
                });
                break;

            case 'stop':
                stop(sessionId);
                break;

            default:
                ws.send(JSON.stringify({
                    id : 'error',
                    message : 'Invalid message ' + message
                }));
                break;
        }
    });
});

/*
 * Definition of functions
 */

// Retrieve or create kurentoClient
function getKurentoClient(callback) {
    console.log("getKurentoClient");
    if (kurentoClient !== null) {
        console.log("KurentoClient already created");
        return callback(null, kurentoClient);
    }

    kurento( ws_uri, function( error, _kurentoClient ) {
        console.log("creating kurento");
        if (error) {
            console.log("Coult not find media server at address " + ws_uri);
            return callback("Could not find media server at address" + ws_uri
                + ". Exiting with error " + error);
        }
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

// Retrieve or create mediaPipeline
function getMediaPipeline( callback ) {
    if ( mediaPipeline !== null ) {
        console.log("MediaPipeline already created");
        return callback( null, mediaPipeline );
    }
    getKurentoClient(function(error, _kurentoClient) {
        if (error) {
            return callback(error);
        }
        _kurentoClient.create( 'MediaPipeline', function( error, _pipeline ) {
            console.log("creating MediaPipeline");
            if (error) {
                return callback(error);
            }
            mediaPipeline = _pipeline;
            callback(null, mediaPipeline);
        });
    });
}

// Retrieve or create composite hub
function getComposite( callback ) {
    if ( composite !== null ) {
        console.log("Composer already created");
        return callback( null, composite, mediaPipeline );
    }
    getMediaPipeline( function( error, _pipeline) {
        if (error) {
            return callback(error);
        }
        _pipeline.create( 'Composite',  function( error, _composite ) {
            console.log("creating Composite");
            if (error) {
                return callback(error);
            }
            composite = _composite;
            callback( null, composite );
        });
    });
}

// Create a hub port
function createHubPort(callback) {
    getComposite(function(error, _composite) {
        if (error) {
            return callback(error);
        }
        _composite.createHubPort( function(error, _hubPort) {
            console.info("Creating hubPort");
            if (error) {
                return callback(error);
            }
            callback( null, _hubPort );
        });
    });
}

// Create a webRTC end point
function createWebRtcEndPoint (callback) {
    getMediaPipeline( function( error, _pipeline) {
        if (error) {
            return callback(error);
        }
        _pipeline.create('WebRtcEndpoint',  function( error, _webRtcEndpoint ) {
            console.info("Creating createWebRtcEndpoint");
            if (error) {
                return callback(error);
            }
            callback( null, _webRtcEndpoint );
        });
    });
}

// Add a webRTC client
function addClient( id, sdp, callback ) {

    clients[id] = {
        id: id,
        webRtcEndpoint : null,
        hubPort : null
    }

    createWebRtcEndPoint(function (error, _webRtcEndpoint) {
        if (error) {
            console.log("Error creating WebRtcEndPoint " + error);
            return callback(error);
        }
        clients[id].webRtcEndpoint = _webRtcEndpoint
        createHubPort(function (error, _hubPort) {
            if (error) {
                stop(id);
                console.log("Error creating HubPort " + error);
                return callback(error);
            }
            clients[id].hubPort = _hubPort;
            clients[id].webRtcEndpoint.connect(clients[id].hubPort);
            clients[id].hubPort.connect(clients[id].webRtcEndpoint);
            clients[id].webRtcEndpoint.processOffer(sdp, function(error, sdpAnswer) {
                if (error) {
                    stop(id);
                    console.log("Error processing offer " + error);
                    return callback(error);
                }
                callback( null, sdpAnswer);
            });
        });
    });
}

// Stop and remove a webRTC client
function stop(id) {
    if (clients[id]) {
        if (clients[id].webRtcEndpoint) {
            clients[id].webRtcEndpoint.release();
        }
        if (clients[id].hubPort) {
            clients[id].hubPort.release();
        }
        delete clients[id];
    }
    if (Object.getOwnPropertyNames(clients).length == 0) {
        if (composite) {
            composite.release();
            composite = null;
        }
        if (mediaPipeline) {
            mediaPipeline.release();
            mediaPipeline = null;
        }
    }
}

app.use(express.static(path.join(__dirname, 'static')));