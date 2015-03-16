var PeerManager = (function () {

  var localId,
      config = {
        peerConnectionConfig: {
          iceServers: [
                        {"url": "stun:23.21.150.121"},
                        {"url": "stun:stun.l.google.com:19302"}
                      ]
        },
        peerConnectionConstraints: {
          optional: [
                     {"DtlsSrtpKeyAgreement": (browser === 'firefox')}
                    ]
        },
        mediaConstraints: {
          'mandatory': {
            'OfferToReceiveAudio': true,
            'OfferToReceiveVideo': true
          }
        }
      },
      peerDatabase = {},
      localStream,
      remoteVideoContainer = document.getElementById('remoteVideosContainer'),
      connection = io.connect(window.location.origin);
      
  connection.on('message', handleMessage);
  connection.on('id', function(id) {
    localId = id;
  });
      
  function addPeer(remoteId) {
    var peer = new Peer(config.peerConnectionConfig, config.peerConnectionConstraints);
    peer.pc.onicecandidate = function(event) {
      if (event.candidate) {
        send('candidate', remoteId, {
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      }
    };
    peer.pc.onaddstream = function(event) {
      attachMediaStream(peer.remoteVideoEl, event.stream);
      remoteVideosContainer.appendChild(peer.remoteVideoEl);
    };
    peer.pc.onremovestream = function(event) {
      peer.remoteVideoEl.src = '';
      remoteVideosContainer.removeChild(peer.remoteVideoEl);
    };
    peer.pc.oniceconnectionstatechange = function(event) {
      switch(
      (  event.srcElement // Chrome
      || event.target   ) // Firefox
      .iceConnectionState) {
        case 'disconnected':
          remoteVideosContainer.removeChild(peer.remoteVideoEl);
          break;
      }
    };
    peerDatabase[remoteId] = peer;
        
    return peer;
  }
  function answer(remoteId) {
    var pc = peerDatabase[remoteId].pc;
    pc.createAnswer(
      function(sessionDescription) {
        pc.setLocalDescription(sessionDescription);
        send('answer', remoteId, sessionDescription);
      }, 
      function(error) { 
        console.log(error);
      },
      config.mediaConstraints
    );
  }
  function offer(remoteId) {
    var pc = peerDatabase[remoteId].pc;
    pc.createOffer(
      function(sessionDescription) {
        pc.setLocalDescription(sessionDescription);
        send('offer', remoteId, sessionDescription);
      }, 
      function(error) { 
        console.log(error);
      },
      config.mediaConstraints
    );
  }
  function handleMessage(message) {
    var type = message.type,
        from = message.from,
        pc = (peerDatabase[from] || addPeer(from)).pc;

    console.log('received: ' + JSON.stringify(message));
  
    switch (type) {
      case 'init':
        toggleLocalStream(pc);
        offer(from);
        break;
      case 'offer':
        pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        answer(from);
        break;
      case 'answer':
        pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        break;
      case 'candidate':
        if(pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate({
            sdpMLineIndex: message.payload.label,
            sdpMid: message.payload.id,
            candidate: message.payload.candidate
          }));
        }
        break;
    }
  }
  function send(type, to, payload) {
    console.log('send type:' + type + ', to: ' + to + ' paylod: ' + JSON.stringify(payload));

    connection.emit('message', {
      to: to,
      type: type,
      payload: payload
    });
  }
  function toggleLocalStream(pc) {
    if(localStream) {
      (!!pc.getLocalStreams().length) ? pc.removeStream(localStream) : pc.addStream(localStream);
    }
  }

  return {
    getId: function() {
      return localId;
    },
    
    setLocalStream: function(stream) {

      // if local cam has been stopped, remove it from all outgoing streams.
      if(!stream) {
        for(id in peerDatabase) {
          pc = peerDatabase[id].pc;
          if(!!pc.getLocalStreams().length) {
            pc.removeStream(localStream);
            offer(id);
          }
        }
      }

      localStream = stream;
    },
    
    peerInit: function(remoteId) {
      peer = peerDatabase[remoteId] || addPeer(remoteId);
      send('init', remoteId, null);
    },

    send: function(type, payload) {
      connection.emit(type, payload);
    }, 

    pushStream: function(remoteId) {
      peer = peerDatabase[remoteId] || addPeer(remoteId);
      toggleLocalStream(peer.pc);
      send('init', remoteId, null);
    }
  };
  
});

var Peer = function (pcConfig, pcConstraints) {
  this.pc = new RTCPeerConnection(pcConfig, pcConstraints);
  this.remoteVideoEl = document.createElement('video');
  this.remoteVideoEl.controls = true;
}