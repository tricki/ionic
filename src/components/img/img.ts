import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, OnInit, Optional, Renderer, ViewChild, ViewEncapsulation } from '@angular/core';

import { Content } from '../content/content';
import { ImgLoader } from './img-loader';
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
    '<img class="ion-img" #img>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class Img implements OnDestroy, OnInit {
  /** @private */
  _pendingSrc: string = '';
  /** @private */
  _loadedSrc: string = '';
  /** @private */
  _tmpDataUri: string;
  /** @private */
  _w: string;
  /** @private */
  _h: string;
  /** @private */
  _isPaused: boolean;
  /** @private */
  _init: boolean;
  /** @private */
  _cache: boolean = true;
  /** @private */
  _lazyLoad: boolean = true;
  /** @private */
  _webWorker: boolean = true;
  /** @private */
  @ViewChild('img') _img: ElementRef;


  constructor(
    private _imgLoader: ImgLoader,
    private _elementRef: ElementRef,
    private _renderer: Renderer,
    private _platform: Platform,
    private _zone: NgZone,
    @Optional() private _content: Content
  ) {
    this._loaded(false, true);
  }

  ngOnInit() {
    // img component is initialized now
    this._init = true;
    if (isValidSrc(this._pendingSrc) && !this._isPaused) {
      this._load();
    }

    if (this._lazyLoad) {
      this._content.addImg(this);
    }
  }

  @Input()
  get src(): string {
    return this._loadedSrc;
  }
  set src(val: string) {
    if (!isValidSrc(val)) {
      this._pendingSrc = val;
      this._loaded(false, false);
      return;
    }

    // valid src
    this._pendingSrc = val;

    // reset any datauri data we might have
    this._tmpDataUri = null;

    if (this._isPaused) {
      this._loaded(false, false);
      return;
    }

    if (this._init) {
      // this component has been initialized
      // so let's do the actual update
      this._load();
      this._loaded(false, true);
    }
  }

  /**
   * @private
   * "pausing" an image will allow existing http requests to continue,
   * but once completed  they will not be rendered since it might cause
   * jank (probably scrolling fast if it's paused). New http requests will
   * also not kick off at this time since we might not even need the
   * image since we could be scrolling by it quickly.
   */
  pause() {
    this._isPaused = true;
  }

  /**
   * @private
   * "pausing" an image will allow existing http requests to continue,
   * but once completed  they will not be rendered since it might cause
   * jank (probably scrolling fast if it's paused). New http requests will
   * also not kick off at this time since we might not even need the
   * image since we could be scrolling by it quickly.
   */
  play() {
    this._isPaused = false;

    if (this._tmpDataUri) {
      // we've already got a datauri to show!
      this._srcAttr(this._tmpDataUri);
      this._loaded(true, true);
      this._tmpDataUri = null;
    }
  }

  _load() {
    if (this._webWorker) {
      // load with the web worker
      // and receive a datauri to put into the src
      this._imgLoader.load(this._pendingSrc, this._cache, msg => {
        nativeRaf(() => {
          this._receivedMsg(msg);
        });
      });

    } else {
      // do not use web worker
      // set the src normally
      this._loadedSrc = this._pendingSrc;
      this._tmpDataUri = null;
      this._srcAttr(this._loadedSrc);
      this._loaded(true, true);
    }
  }

  _receivedMsg(msg: ImgResponseMessage) {
    if (msg.src !== this._pendingSrc) {
      // the src already changed on us
      // so this data is no longer valid!!
      this._loadedSrc = '';
      this._srcAttr('');
      this._tmpDataUri = null;
      this._loaded(false, false);

    } else if (msg.status === 200) {
      // success :)
      // remember this is the loaded src
      this._loadedSrc = msg.src;

      if (this._isPaused) {
        // we're currently paused, so we don't want to render anything
        // but we did get back the data successfully, so let's remember it
        // and maybe we can render it later
        this._tmpDataUri = msg.data;

      } else {
        // it's not paused, so it's safe to render the datauri
        this._srcAttr(msg.data);
        this._loaded(true, true);
      }

    } else {
      // error :(
      console.error(`img, ${msg.msg}`);

      this._loadedSrc = '';
      this._srcAttr('');
      this._tmpDataUri = null;
      this._loaded(false, false);
    }
  }

  _loaded(isLoaded: boolean, useFadeTransition: boolean) {
    this._renderer.setElementClass(this._elementRef.nativeElement, 'img-loaded', isLoaded);
    this._renderer.setElementClass(this._elementRef.nativeElement, 'img-no-fade', !useFadeTransition);
  }

  _srcAttr(srcValue: string) {
    if (this._img) {
      this._renderer.setElementAttribute(this._img.nativeElement, 'src', srcValue);
    }
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
    return !!this._webWorker;
  }
  set webWorker(val: boolean) {
    this._webWorker = isTrueProperty(val);
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


function isValidSrc(src: string) {
  return isPresent(src) && src !== '';
}
