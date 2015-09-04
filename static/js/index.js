
var ws = new WebSocket('ws://' + location.host + '/one2many'),
     video,
     webRtcPeer;

window.onload = function() {
	console = new Console();
	video = document.getElementById('video');

	document.getElementById('call').addEventListener('click', presenter);
	document.getElementById('viewer').addEventListener('click', viewer);
	document.getElementById('terminate').addEventListener('click',  stop);
}

window.onbeforeunload = function() {
	ws.close();
}

ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);

	switch (parsedMessage.id) {
		case 'presenterResponse':
			presenterResponse(parsedMessage);
			break;
		case 'viewerResponse':
			presenterResponse(parsedMessage);
			break;
		case 'stopCommunication':
			dispose();
			break;
		case 'iceCandidate':
			webRtcPeer.addIceCandidate(parsedMessage.candidate)
			break;
		default:
			console.error('Unrecognized message', parsedMessage);
	}
}

function presenterResponse(message) {
	if (message.response === 'accepted') return webRtcPeer.processAnswer(message.sdpAnswer);	
	var errorMsg = message.message ? message.message : 'Unknow error';
	console.warn('Call not accepted for the following reason: ' + errorMsg);
	dispose();
}

function presenter() {
	if (webRtcPeer) return;
	showSpinner(video);

	var options = {
		localVideo: video,
		onicecandidate : onIceCandidate
    }

	webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
		if(error) return onError(error);

		this.generateOffer(onOfferPresenter);
	});
}

function onOfferPresenter(error, offerSdp) {
    if (error) return onError(error);
	var message = {
		id : 'presenter',
		sdpOffer : offerSdp
	};
	sendMessage(message);
}

function viewer() {
	if (webRtcPeer) return;
	showSpinner(video);
	var options = {
		remoteVideo: video,
		onicecandidate : onIceCandidate
	}
	webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
		if(error) return onError(error);
		this.generateOffer(onOfferViewer);
	});
}

function onOfferViewer(error, offerSdp) {
	if (error) return onError(error);
	var message = {
		id : 'viewer',
		sdpOffer : offerSdp
	}
	sendMessage(message);
}

function onIceCandidate(candidate) {
   var message = {
      id : 'onIceCandidate',
      candidate : candidate
   }
   sendMessage(message);
}

function stop() {
	if (!webRtcPeer) 	return;
	var message = {	id : 'stop'	};
	sendMessage(message);
	dispose();
}

function dispose() {
	if (!webRtcPeer) return;	
	webRtcPeer.dispose();
	webRtcPeer = null;
	hideSpinner(video);
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	//console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});
