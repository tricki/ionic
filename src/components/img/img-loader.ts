import { Subject } from 'rxjs/Subject';


export class ImgLoader {
  private _w: Worker;

  update = new Subject<any>();

  load(src: string, cache: boolean) {
    this.worker().postMessage({
      src: src,
      cache: cache
    });
  }

  abort(src: string) {
    this.worker().postMessage({
      src: src,
      type: 'abort'
    });
  }

  private worker() {
    if (!this._w) {
      // create a blob from the inline worker string
      const workerBlob = new Blob([INLINE_WORKER]);

      // obtain a blob URL reference to our worker 'file'.
      const blobURL = window.URL.createObjectURL(workerBlob);

      // create the worker
      this._w = new Worker(blobURL);

      // create worker onmessage handler
      this._w.onmessage = (ev: MessageEvent) => {
        // we got something back from the web worker
        // let's emit this out to everyone listening
        this.update.next(ev.data);
      };

      // create worker onerror handler
      this._w.onerror = (ev: ErrorEvent) => {
        console.error(`ImgWorker: ${ev.message}`);
        this._w.terminate();
        this._w = null;
        this.update.unsubscribe();
      };
    }

    // return that hard worker
    return this._w;
  }

}


const INLINE_WORKER = `
onmessage = function (msg) {
    var src = msg.data.src;
    var imgData = imgs[src];
    if (msg.data.type === 'abort') {
        if (imgData && imgData.xhr) {
            console.debug('img, abort:', src);
            imgData.xhr.abort();
            imgData.xhr = null;
        }
        return;
    }
    if (msg.data.cache && imgData && imgData.data) {
        console.debug('img, from cache:', src);
        imgData.time = Date.now();
        postMessage({
            src: src,
            status: 200,
            data: imgData.data
        });
        return;
    }
    if (imgData && imgData.xhr) {
        imgData.time = Date.now();
        return;
    }
    if (!imgData) {
        imgData = imgs[src] = {
            time: Date.now(),
            cache: msg.data.cache
        };
    }
    var xhr = imgData.xhr = new XMLHttpRequest();
    xhr.open('GET', src, true);
    xhr.responseType = 'arraybuffer';
    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            var rsp = {
                src: src,
                status: xhr.status
            };
            if (xhr.status === 200) {
                rsp.data = getDataUri(xhr.getResponseHeader('Content-Type'), xhr.response);
                if (imgData.cache) {
                    imgData.data = rsp.data;
                    clearTimeout(tmr);
                    tmr = setTimeout(clean, 1000);
                }
            }
            postMessage(rsp);
            imgData.xhr = null;
        }
    };
    xhr.onerror = function (e) {
        postMessage({
            src: src,
            status: 500,
            msg: e.message
        });
        imgData.xhr = null;
    };
    xhr.send();
};
var imgs = {};
var tmr;
function clean() {
    var oldest;
    var removeSrc;
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
function getDataUri(contentType, arrayBuffer) {
    var base64 = "data:" + contentType + ";base64,";
    var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var bytes = new Uint8Array(arrayBuffer);
    var byteLength = bytes.byteLength;
    var byteRemainder = byteLength % 3;
    var mainLength = byteLength - byteRemainder;
    var a, b, c, d, chunk;
    for (var i = 0; i < mainLength; i = i + 3) {
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        a = (chunk & 16515072) >> 18;
        b = (chunk & 258048) >> 12;
        c = (chunk & 4032) >> 6;
        d = chunk & 63;
        base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
    }
    if (byteRemainder === 1) {
        chunk = bytes[mainLength];
        a = (chunk & 252) >> 2;
        b = (chunk & 3) << 4;
        base64 += encodings[a] + encodings[b] + '==';
    }
    else if (byteRemainder === 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
        a = (chunk & 64512) >> 10;
        b = (chunk & 1008) >> 4;
        c = (chunk & 15) << 2;
        base64 += encodings[a] + encodings[b] + encodings[c] + '=';
    }
    return base64;
}
`;


export interface ImgWorkerResponseMessage {
  src: string;
  status?: number;
  data?: string;
  msg?: string;
}

export interface ImgWorkerCallback {
  (msg: ImgWorkerResponseMessage): void;
}
