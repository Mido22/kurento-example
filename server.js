require('es6-promise').polyfill();

var path = require('path'),
    url = require('url'),
    express = require('express'),
    ws = require('ws'),
    kurento = require('kurento-client'),
    app = express(),
    host = 'http://localhost:3000',
    port = 3000,
    kurentoURL = 'ws://13.198.103.36:8888/kurento',
    idCounter = 0,
    candidatesQueue = {},
    kurentoClient = null,
    presenter = null,
    viewers = [],
    noPresenterMessage = 'No active presenter. Try again later...',
    server = app.listen(port, function() {
        console.log('Kurento Tutorial started');
    }),
    wss = new ws.Server({
        server : server,
        path : '/one2many'
    });

wss.on('connection', function(ws) {

    var sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);

        switch (message.id) {
            case 'presenter':
                startPresenter(sessionId, ws, message.sdpOffer);
                break;
            case 'viewer':
                startViewer(sessionId, ws, message.sdpOffer);
                break;
            case 'stop':
                stop(sessionId);
                break;
            case 'onIceCandidate':
                onIceCandidate(sessionId, message.candidate);
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

function startPresenter(sessionId, ws, sdpOffer) {
    clearCandidatesQueue(sessionId);

    presenter = {
        id : sessionId,
        pipeline : null,
        webRtcEndpoint : null
    }

    return getKurentoClient().then(function() {
        return kurentoClient.create('MediaPipeline');
    }).then(function(pipeline){
        presenter.pipeline = pipeline;
        return pipeline.create('WebRtcEndpoint');
    }).then(function(webRtcEndpoint){        
        presenter.webRtcEndpoint =  webRtcEndpoint;        
        return webRtcEndpoint.processOffer(sdpOffer);
    }).then(function(sdpAnswer) {
        addEndPointListeners(sessionId, presenter.webRtcEndpoint, ws);
        ws.send(JSON.stringify({
            id : 'presenterResponse',
            response : 'accepted',
            sdpAnswer : sdpAnswer
        }));
    }).catch(function(error){
        onError(error);
        ws.send(JSON.stringify({
            id : 'presenterResponse',
            response : 'rejected',
            message : error
        }));                
    });;
}

function startViewer(sessionId, ws, sdpOffer) {
    clearCandidatesQueue(sessionId);
    var sdpAnswer;
    return presenter.pipeline.create('WebRtcEndpoint').then(function(webRtcEndpoint) {
        viewers[sessionId] = {
            "webRtcEndpoint" : webRtcEndpoint,
            "ws" : ws
        };
        return presenter.webRtcEndpoint.connect(viewers[sessionId].webRtcEndpoint);
    }).then(function(){
        return viewers[sessionId].webRtcEndpoint.processOffer(sdpOffer);
    }).then(function(sdpAnswer) {
        addEndPointListeners(sessionId, viewers[sessionId].webRtcEndpoint, ws);
        ws.send(JSON.stringify({
            id : 'viewerResponse',
            response : 'accepted',
            sdpAnswer : sdpAnswer
        }));
    }).catch(function(error){
        onError(error);
        ws.send(JSON.stringify({
            id : 'viewerResponse',
            response : 'rejected',
            message : error
        }));
    });
}

function stop(sessionId) {
    try{
        if (presenter !== null && presenter.id == sessionId) {
            for (var i in viewers) {
                var viewer = viewers[i];
                if (viewer.ws) {
                    viewer.ws.send(JSON.stringify({
                        id : 'stopCommunication'
                    }));
                }
            }
            presenter.pipeline.release();
            presenter = null;
            viewers = [];

        } else if (viewers[sessionId]) {
            viewers[sessionId].webRtcEndpoint.release();
            delete viewers[sessionId];
        }

        clearCandidatesQueue(sessionId);
    }catch(e){
        onError(e);
    }
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (presenter && presenter.id === sessionId && presenter.webRtcEndpoint) {
        presenter.webRtcEndpoint.addIceCandidate(candidate);
    }else if (viewers[sessionId] && viewers[sessionId].webRtcEndpoint) {
        viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    }else {
        if (!candidatesQueue[sessionId])
            candidatesQueue[sessionId] = [];    
        candidatesQueue[sessionId].push(candidate);
    }
}

function getKurentoClient() {
    if(kurentoClient)  return Promise.resolve();
    
    return kurento(kurentoURL).then(function(kc){   
        kurentoClient = kc;
    }).catch(console.log.bind(console));
}

function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}

function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function addEndPointListeners(id, endPoint, ws){

    if (candidatesQueue[id]) {
        while(candidatesQueue[id].length) {
            var candidate = candidatesQueue[id].shift();
            endPoint.addIceCandidate(candidate);
        }
    }

    endPoint.on('OnIceCandidate', function(event) {
        ws.send(JSON.stringify({
            id : 'iceCandidate',
            candidate : kurento.register.complexTypes.IceCandidate(event.candidate)
        }));
    });

    endPoint.gatherCandidates().catch(onError);
}

function onError(e){console.log('error occured: ', e);}
app.use(express.static(path.join(__dirname, 'static')));
