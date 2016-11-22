import { ChangeDetectionStrategy, Component, ElementRef, HostBinding, Input, NgZone, Optional, Renderer, ViewChild, ViewEncapsulation } from '@angular/core';

import { Content } from '../content/content';
import { ImgLoader } from './img-loader';
import { isPresent } from '../../util/util';
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
export class Img {
  /** @private */
  _src: string = '';
  /** @private */
  _pSrc: string = '';
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
    if (isValidSrc(this._pSrc) && !this._isPaused) {
      this._load();
    }

  }

  @Input()
  get src(): string {
    return this._src;
  }
  set src(val: string) {
    if (!isValidSrc(val)) {
      this._pSrc = this._src = val;
      this._loaded(false, false);
      return;
    }

    // valid src
    this._pSrc = val;

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
  pause(shouldLock: boolean) {
    this._isPaused = shouldLock;

    if (!shouldLock) {
      // just been unlocked

    }
  }

  _load() {
    // this._imgLoader.load(this._pSrc, this._cache, msg => {
    //   if (this._isPaused) return;

    //   nativeRaf(() => {
    //     if (this._isPaused) return;

    //     if (msg.status === 200) {
    //       // success :)
    //       this._src = msg.src;
    //       this._srcAttr(msg.data);
    //       this._loaded(true, true);

    //     } else {
    //       // error :(
    //       console.error(`img, ${msg.msg}`);

    //       this._src = '';
    //       this._srcAttr('');
    //       this._loaded(false, false);
    //     }
    //   });
    // });
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
