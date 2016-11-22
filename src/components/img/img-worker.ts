onmessage = function(msg: ImgRequestMessage) {
  var src = msg.data.src;
  var imgData = imgs[src];

  if (msg.data.type === 'abort') {
    if (imgData && imgData.xhr) {
      // there's an active xhr for this src
      // so let's abort and reset it
      imgData.xhr.abort();
      imgData.xhr = null;
    }
    return;
  }

  if (msg.data.cache && imgData && imgData.data) {
    // cool, we already have data for this image
    imgData.time = Date.now();

    (<any>postMessage)(<ImgResponseMessage>{
      src: src,
      status: 200,
      data: imgData.data
    });
    return;
  }

  if (imgData && imgData.xhr) {
    // we already have img info and there's currently an xhr for it
    // so let's do nothing and hope the existing xhr completes
    imgData.time = Date.now();
    return;
  }

  if (!imgData) {
    // we don't have img data created yet
    // also put this in the global object
    imgData = imgs[src] = {
      time: Date.now(),
      cache: msg.data.cache
    };
  }

  // let's start up a new xhr
  var xhr = imgData.xhr = new XMLHttpRequest();
  xhr.open('GET', src, true);
  xhr.responseType = 'arraybuffer';

  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      // cool, the request has completed
      var rsp: ImgResponseMessage = {
        src: src,
        status: xhr.status
      };

      if (xhr.status === 200) {
        // success, we got the image data!
        rsp.data = getDataUri(xhr.getResponseHeader('Content-Type'), xhr.response);

        if (imgData.cache) {
          // let's also cache this data
          imgData.data = rsp.data;

          // schedule a cleaning
          clearTimeout(tmr);
          tmr = setTimeout(clean, 1000);
        }
      }

      (<any>postMessage)(rsp);
      imgData.xhr = null;
    }
  };

  xhr.onerror = function(e) {
    (<any>postMessage)(<ImgResponseMessage>{
      src: src,
      status: 500,
      msg: e.message
    });
    imgData.xhr = null;
  };

  xhr.send();
};

const imgs: {[src: string]: ImgData} = {};
let tmr: any;

function clean() {
  var oldest: number;
  var removeSrc: string;
  var srcs = Object.keys(imgs);

  while (srcs.length > 200) {
    for (var i = 0, l = srcs.length; i < l; i++) {
      if (!oldest || imgs[srcs[i]].time < oldest) {
        removeSrc = srcs[i];
        oldest = imgs[removeSrc].time;
      }
    }
    if (removeSrc) {
      if (imgs[removeSrc].xhr) {
        imgs[removeSrc].xhr.abort();
      }
      delete imgs[removeSrc];
    }
    srcs = Object.keys(imgs);
    removeSrc = oldest = null;
  }
}


function getDataUri(contentType: string, arrayBuffer: ArrayBuffer) {
  var base64 = `data:${contentType};base64,`;
  var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  var bytes = new Uint8Array(arrayBuffer);
  var byteLength = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength = byteLength - byteRemainder;

  var a, b, c, d, chunk;

  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048)   >> 12; // 258048   = (2^6 - 1) << 12
    c = (chunk & 4032)     >>  6; // 4032     = (2^6 - 1) << 6
    d = chunk & 63;               // 63       = 2^6 - 1

    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder === 1) {
    chunk = bytes[mainLength];

    a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

    // Set the 4 least significant bits to zero
    b = (chunk & 3)   << 4; // 3   = 2^2 - 1

    base64 += encodings[a] + encodings[b] + '==';

  } else if (byteRemainder === 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

    a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
    b = (chunk & 1008)  >>  4; // 1008  = (2^6 - 1) << 4

    // Set the 2 least significant bits to zero
    c = (chunk & 15)    <<  2; // 15    = 2^4 - 1

    base64 += encodings[a] + encodings[b] + encodings[c] + '=';
  }

  return base64;
}


interface ImgData {
  time: number;
  cache: boolean;
  data?: string;
  xhr?: XMLHttpRequest;
}


interface ImgRequestMessage {
  data: {
    src: string;
    type: string;
    cache: boolean;
  };
}

interface ImgResponseMessage {
  src: string;
  status?: number;
  data?: string;
  msg?: string;
}
