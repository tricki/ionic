import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, OnInit, Optional, Renderer, ViewChild, ViewEncapsulation } from '@angular/core';

import { Content } from '../content/content';
import { ImgLoader } from './img-loader';
import { ImgResponseMessage } from './img-worker';
import { isPresent, isTrueProperty } from '../../util/util';
import { nativeRaf } from '../../util/dom';
import { Platform } from '../../platform/platform';


/**
 * @private
 */
@Component({
  selector: 'ion-img',
  template:
    '<div class="img-placeholder" [style.height]="_h" [style.width]="_w"></div>' +
    '<img #img>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class Img implements OnDestroy, OnInit {
  /** @internal */
  _pendingSrc: string;
  /** @internal */
  _loadedSrc: string;
  /** @internal */
  _tmpDataUri: string;
  /** @internal */
  _isPaused: boolean;
  /** @internal */
  _init: boolean;
  /** @internal */
  _cache: boolean = true;
  /** @internal */
  _lazyLoad: boolean = true;
  /** @internal */
  _ww: boolean = true;
  /** @internal */
  _sub: any;

  /** @private */
  _w: string;
  /** @private */
  _h: string;
  /** @private */
  @ViewChild('img') _img: ElementRef;


  constructor(
    private _ldr: ImgLoader,
    private _elementRef: ElementRef,
    private _renderer: Renderer,
    private _platform: Platform,
    private _zone: NgZone,
    @Optional() private _content: Content
  ) {
    this._loaded(false);
  }

  /**
   * @private
   */
  ngOnInit() {
    // img component is initialized now
    this._init = true;

    if (this._lazyLoad) {
      this._content.addImg(this);
    }

    if (isValidSrc(this._pendingSrc)) {
      this._loadReqest(this._pendingSrc);
    }
  }

  @Input()
  get src(): string {
    return this._pendingSrc || this._loadedSrc;
  }
  set src(val: string) {
    if (!isValidSrc(val)) {
      // eww, bad src value
      if (this._pendingSrc) {
        this._ldr.abort(this._pendingSrc);
      }
      this._pendingSrc = this._loadedSrc = this._tmpDataUri = null;
      this._loaded(false);
      return;
    }

    if (val === this._pendingSrc || val === this._loadedSrc) {
      // hey what's going on here, it's the same!
      return;
    }

    // new image, so let's set we're not loaded yet
    this._loaded(false);

    // woot! we've got a valid src
    this._pendingSrc = val;

    // reset any existing data we might have
    this._loadedSrc = this._tmpDataUri = null;

    // only start loading if the component has been initialized
    if (this._init) {
      // this component has been initialized
      // so let's do the actual update
      this._loadReqest(val);
    }
  }

  /**
   * @private
   */
  pause() {
    this._isPaused = true;
  }

  /**
   * @private
   */
  play() {
    this._isPaused = false;

    if (this._tmpDataUri) {
      // we've already got a datauri to show!
      this._srcAttr(this._tmpDataUri);
      this._loaded(true);
      this._tmpDataUri = null;

    } else if (this._pendingSrc) {
      // still got a pending src
      // let's load it up
      this._loadReqest(this._pendingSrc);
    }
  }

  /**
   * @internal
   */
  _loadReqest(src: string) {
    if (this._ww) {
      // load with the web worker
      // and receive a datauri to put into the src

      if (!this._sub) {
        // create a subscription to the loader's update
        // if we don't already have one
        this._sub = this._ldr.update.subscribe((msg: ImgResponseMessage) => {
          nativeRaf(() => {
            this._loadResponse(msg);
          });
        });
      }

      // tell the loader, to tell the web worker
      // to request the image and start receiving it
      this._ldr.load(src, this._cache);

    } else {
      // do not use web worker
      this._pendingSrc = this._tmpDataUri = null;
      this._loadedSrc = src;
      this._srcAttr(src);
      this._loaded(true);
    }
  }

  /**
   * @internal
   */
  _loadResponse(msg: ImgResponseMessage) {
    if (msg.src !== this._pendingSrc) {
      // this isn't the droid we're looking for
      return;
    }

    if (msg.status === 200) {
      // success :)
      // remember this is the loaded src
      this._loadedSrc = msg.src;
      this._pendingSrc = null;

      if (this._isPaused) {
        // we're currently paused, so we don't want to render anything
        // but we did get back the data successfully, so let's remember it
        // and maybe we can render it later
        this._tmpDataUri = msg.data;

      } else {
        // it's not paused, so it's safe to render the datauri
        this._srcAttr(msg.data);
        this._loaded(true);
      }

    } else {
      // error :(
      console.error(`img, status: ${msg.status} ${msg.msg}`);

      this._loadedSrc = this._pendingSrc = this._tmpDataUri = null;
      this._srcAttr('');
      this._loaded(false);
    }
  }

  /**
   * @internal
   */
  _srcAttr(srcValue: string) {
    if (this._img) {
      this._renderer.setElementAttribute(this._img.nativeElement, 'src', srcValue);
    }
  }

  /**
   * @internal
   */
  _loaded(isLoaded: boolean) {
    this._renderer.setElementClass(this._elementRef.nativeElement, 'img-loaded', isLoaded);
  }

  /**
   * @private
   * DOM READ
   */
  getTop() {
    let ele: HTMLElement = this._elementRef.nativeElement;
    let parentEle = ele.parentElement;
    for (var i = 0; i < 10 && parentEle; i++) {
      var vtop = (<any>parentEle.dataset).vtop;
      if (vtop) {
        if (vtop === 'hidden') {
          return Infinity;
        }
        return parseInt((<any>parentEle.dataset).vtop, 10);
      }
      parentEle = parentEle.parentElement;
    }
    return ele.offsetTop;
  }

  /**
   * @private
   * DOM READ
   */
  getLeft() {
    let ele: HTMLElement = this._elementRef.nativeElement;
    let parentEle = ele.parentElement;
    for (var i = 0; i < 10 && parentEle; i++) {
      if ((<any>parentEle.dataset).vleft) {
        return parseInt((<any>parentEle.dataset).vleft, 10);
      }
      parentEle = parentEle.parentElement;
    }
    return ele.offsetLeft;
  }

  @Input()
  get lazyLoad(): boolean {
    return !!this._lazyLoad;
  }
  set lazyLoad(val: boolean) {
    this._lazyLoad = isTrueProperty(val);
  }

  @Input()
  get webWorker(): boolean {
    return !!this._ww;
  }
  set webWorker(val: boolean) {
    this._ww = isTrueProperty(val);
  }

  @Input()
  get cache(): boolean {
    return this._cache;
  }
  set cache(val: boolean) {
    this._cache = val;
  }

  @Input()
  set width(val: string | number) {
    this._w = getUnitValue(val);
  }

  @Input()
  set height(val: string | number) {
    this._h = getUnitValue(val);
  }

  @Input() alt: string;

  @Input() title: string;

  @HostBinding('style.width')
  get _width(): string {
    return isPresent(this._w) ? this._w : '';
  }

  @HostBinding('style.height')
  get _height(): string {
    return isPresent(this._h) ? this._h : '';
  }

  ngOnDestroy() {
    this._sub && this._sub.unsubscribe();
    this._content.removeImg(this);
  }

}

function getUnitValue(val: any): string {
  if (isPresent(val)) {
    if (typeof val === 'string') {
      if (val.indexOf('%') > -1 || val.indexOf('px') > -1) {
        return val;
      }
      if (val.length) {
        return val + 'px';
      }

    } else if (typeof val === 'number') {
      return val + 'px';
    }
  }
  return '';
}


export function isValidSrc(src: string) {
  return isPresent(src) && src !== '';
}
