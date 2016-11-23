import { Subject } from 'rxjs/Subject';

import { assert } from './util';
import { CSS, pointerCoord, rafFrames, nativeRaf, cancelRaf } from '../util/dom';
import { eventOptions, listenEvent } from './ui-event-manager';


export class ScrollView {
  isScrolling = false;
  scrollStart = new Subject<ScrollEvent>();
  scroll = new Subject<ScrollEvent>();
  scrollEnd = new Subject<ScrollEvent>();

  private _el: HTMLElement;
  private _js: boolean = false;
  private _top: number = 0;
  private _h: number = 0;
  private _scLsn: Function;
  private _endTmr: Function;
  private _domWrites: Function[] = [];

  private _ev: ScrollEvent = {
    domWrite: (fn: Function) => {
      if (typeof fn === 'function') {
        this._domWrites.push(fn);
      }
    }
  };

  constructor(ele: HTMLElement) {
    assert(ele, 'scroll-view, element can not be null');
    this._el = ele;
    this.enableNativeScrolling();
  }

  private enableNativeScrolling() {
    this._scLsn && this._scLsn();

    const opts = eventOptions(false, true);
    const positions: number[] = [];

    const run = (timeStamp: number) => {
      // get the current scrollTop
      // ******** DOM READ ****************
      var top = this.getTop();

      // get the current scrollLeft
      // ******** DOM READ ****************
      var left = this.getLeft();

      // get the current scrollHeight
      // ******** DOM READ ****************
      var height = this.getHeight();

      if (!this.isScrolling) {
        // currently not scrolling, so this is a scroll start
        this.isScrolling = true;
        positions.length = 0;
        positions.push(top, left, timeStamp);

        this._scrollEvent(EVENT_SCROLL_START, top, left, height, timeStamp, 0, 0);

      } else {
        // still actively scrolling
        positions.push(top, left, timeStamp);

        var endPos = (positions.length - 1);
        var startPos = endPos;
        var timeRange = (timeStamp - 100);
        var velocityY = 0;
        var velocityX = 0;

        // move pointer to position measured 100ms ago
        for (var i = endPos; i > 0 && positions[i] > timeRange; i -= 3) {
          startPos = i;
        }

        if (startPos !== endPos) {
          // compute relative movement between these two points
          var timeOffset = (positions[endPos] - positions[startPos]);
          var movedTop = (positions[startPos - 2] - positions[endPos - 2]);
          var movedLeft = (positions[startPos - 1] - positions[endPos - 1]);

          // based on XXms compute the movement to apply for each render step
          velocityY = ((movedTop / timeOffset) * FRAME_MS);
          velocityX = ((movedLeft / timeOffset) * FRAME_MS);
        }

        this._scrollEvent(EVENT_SCROLL, top, left, height, timeStamp, velocityY, velocityX);
      }

      // debounce then emit on the last scroll event
      this._endTmr && this._endTmr();
      this._endTmr = rafFrames(6, (rafTimeStamp) => {
        // haven't scrolled in a while, so it's a scrollend
        this.isScrolling = false;
        positions.length = 0;
        this._scrollEvent(EVENT_SCROLL_END, top, left, height, rafTimeStamp, 0, 0);
      });

    };

    this._scLsn = listenEvent(this._el, EVENT_SCROLL, false, opts, () => {
      nativeRaf(rafTimeStamp => {
        run(rafTimeStamp);
      });
    });
  }

  /**
   * @private
   */
  private _scrollEvent(eventType: string, top: number, left: number, height: number, timeStamp: number, velocityY: number, velocityX: number) {
    const ev = this._ev;

    // double check we've cleared out callbacks
    this._domWrites.length = 0;

    ev.type = eventType;
    ev.timeStamp = timeStamp;
    ev.scrollTop = top;
    ev.scrollLeft = left;
    ev.scrollHeight = height;
    ev.velocityY = velocityY;
    ev.velocityX = velocityX;

    if (eventType === EVENT_SCROLL_START) {
      // remember the start positions
      ev.startY = ev.scrollTop;
      ev.startX = ev.scrollLeft;

      // forget the deltas
      ev.deltaY = ev.deltaX = 0;

      // emit only on the first scroll event
      // ******** DOM READ (possible) ****************
      this.scrollStart.next(ev);
    }

    if (eventType === EVENT_SCROLL_START || eventType === EVENT_SCROLL) {
      ev.deltaY = (ev.scrollTop - ev.startY);
      ev.deltaX = (ev.scrollLeft - ev.startX);

      // emit on each scrollstart or just scroll events
      // should not fire on scrollend event
      // ******** DOM READ (possible) ****************
      this.scroll.next(ev);

    } else if (eventType === EVENT_SCROLL_END) {
      // another scroll event hasn't happened for a while
      // so we must have stopped scrolling
      // emit scroll end
      // ******** DOM READ (possible) ****************
      this.scrollEnd.next(ev);
    }

    // ******** DOM READS ABOVE / DOM WRITES BELOW ****************

    // fire off all of the dom writes we've collected up
    // ******** DOM WRITE ****************
    for (var i = 0, l = this._domWrites.length; i < l; i++) {
      this._domWrites[i](ev);
    }

    // clear out callbacks
    this._domWrites.length = 0;
  }

  /**
   * @private
   * JS Scrolling has been provided only as a temporary solution
   * until iOS apps can take advantage of scroll events at all times.
   * The goal is to eventually remove JS scrolling entirely. When we
   * no longer have to worry about iOS not firing scroll events during
   * inertia then this can be burned to the ground. iOS's more modern
   * WKWebView does not have this issue, only UIWebView does.
   */
  enableJsScroll() {
    this._js = true;
    const ele = this._el;
    const positions: number[] = [];
    let rafId: number;
    let max: number;
    let velocityY = 0;

    // stop listening for actual scroll events
    this._scLsn();

    const setMax = () => {
      if (!max) {
        // ******** DOM READ ****************
        max = (ele.offsetHeight - ele.parentElement.offsetHeight + ele.parentElement.offsetTop);
      }
    };

    const decelerate = (timeStamp: number) => {
      console.debug(`scroll-view, decelerate, velocity: ${velocityY}`);
      if (velocityY) {
        velocityY *= DECELERATION_FRICTION;

        // update top with updated velocity
        // clamp top within scroll limits
        this._top = Math.min(Math.max(this._top + velocityY, 0), max);

        // ******** DOM READ THEN DOM WRITE ****************
        this._scrollEvent(EVENT_SCROLL, this._top, 0, this.getHeight(), timeStamp, velocityY, 0);

        // ******** DOM WRITE ****************
        this.setTop(this._top);

        if (this._top > 0 && this._top < max && Math.abs(velocityY) > MIN_VELOCITY_CONTINUE_DECELERATION) {
          rafId = nativeRaf((rafTimeStamp: number) => {
            decelerate(rafTimeStamp);
          });

        } else {
          this.isScrolling = false;
          this._scrollEvent(EVENT_SCROLL_END, this._top, 0, this.getHeight(), timeStamp, velocityY, 0);
        }
      }
    };

    const touchStart = (touchEvent: TouchEvent) => {
      velocityY = 0;
      positions.length = 0;
      max = null;
      positions.push(pointerCoord(touchEvent).y, touchEvent.timeStamp);
    };

    const touchMove = (touchEvent: TouchEvent) =>  {
      if (!positions.length) {
        return;
      }

      var y = pointerCoord(touchEvent).y;

      // ******** DOM READ ****************
      setMax();

      this._top -= (y - positions[positions.length - 2]);

      this._top = Math.min(Math.max(this._top, 0), max);

      positions.push(y, touchEvent.timeStamp);

      if (!this.isScrolling) {
        this.isScrolling = true;
        this._scrollEvent(EVENT_SCROLL_START, this._top, 0, this.getHeight(), touchEvent.timeStamp, velocityY, 0);
      }

      // ******** DOM READ THEN DOM WRITE ****************
      this._scrollEvent(EVENT_SCROLL, this._top, 0, this.getHeight(), touchEvent.timeStamp, velocityY, 0);

      // ******** DOM WRITE ****************
      this.setTop(this._top);
    };

    const touchEnd = (touchEvent: TouchEvent) => {
      // figure out what the scroll position was about 100ms ago
      velocityY = 0;
      cancelRaf(rafId);

      if (!positions.length) return;

      var y = pointerCoord(touchEvent).y;

      positions.push(y, touchEvent.timeStamp);

      var endPos = (positions.length - 1);
      var startPos = endPos;
      var timeRange = (touchEvent.timeStamp - 100);

      // move pointer to position measured 100ms ago
      for (var i = endPos; i > 0 && positions[i] > timeRange; i -= 2) {
        startPos = i;
      }

      if (startPos !== endPos) {
        // compute relative movement between these two points
        var timeOffset = (positions[endPos] - positions[startPos]);
        var movedTop = (positions[startPos - 1] - positions[endPos - 1]);

        // based on XXms compute the movement to apply for each render step
        velocityY = ((movedTop / timeOffset) * FRAME_MS);

        // verify that we have enough velocity to start deceleration
        if (Math.abs(velocityY) > MIN_VELOCITY_START_DECELERATION) {
          // ******** DOM READ ****************
          setMax();

          rafId = nativeRaf((rafTimeStamp: number) => {
            decelerate(rafTimeStamp);
          });
        }
      }

      positions.length = 0;
    };

    const opts = eventOptions(false, true);
    const unRegStart = listenEvent(ele, 'touchstart', false, opts, touchStart);
    const unRegMove = listenEvent(ele, 'touchmove', false, opts, touchMove);
    const unRegEnd = listenEvent(ele, 'touchend', false, opts, touchEnd);

    ele.parentElement.classList.add('js-scroll');

    // create an unregister for all of these events
    this._scLsn = () => {
      unRegStart();
      unRegMove();
      unRegEnd();
      ele.parentElement.classList.remove('js-scroll');
    };
  }


  getTop() {
    if (this._js) {
      return this._top;
    }
    return this._top = this._el.scrollTop;
  }

  getLeft() {
    if (this._js) {
      return 0;
    }
    return this._el.scrollLeft;
  }

  getHeight() {
    if (!this._h) {
      this._h = this._el.scrollHeight;
    }
    return this._h;
  }

  resetHeight() {
    this._h = null;
  }

  setTop(top: number) {
    this._top = top;

    if (this._js) {
      (<any>this._el.style)[CSS.transform] = `translate3d(0px,${top * -1}px,0px)`;

    } else {
      this._el.scrollTop = top;
    }
  }

  scrollTo(x: number, y: number, duration: number, done?: Function): Promise<any> {
    // scroll animation loop w/ easing
    // credit https://gist.github.com/dezinezync/5487119

    let promise: Promise<any>;
    if (done === undefined) {
      // only create a promise if a done callback wasn't provided
      // done can be a null, which avoids any functions
      promise = new Promise((res, rej) => {
        done = res;
        done = rej;
      });
    }

    const self = this;
    if (!self._el) {
      // invalid element
      done();
      return promise;
    }

    x = x || 0;
    y = y || 0;

    const fromY = self._el.scrollTop;
    const fromX = self._el.scrollLeft;

    const maxAttempts = (duration / 16) + 100;

    let startTime: number;
    let attempts = 0;

    // scroll loop
    function step(timeStamp: number) {
      attempts++;

      if (!self._el || !self.isScrolling || attempts > maxAttempts) {
        self.isScrolling = false;
        self._el.style.transform = ``;
        done();
        return;
      }

      let time = Math.min(1, ((timeStamp - startTime) / duration));

      // where .5 would be 50% of time on a linear scale easedT gives a
      // fraction based on the easing method
      let easedT = (--time) * time * time + 1;

      if (fromY !== y) {
        self.setTop((easedT * (y - fromY)) + fromY);
      }

      if (fromX !== x) {
        self._el.scrollLeft = Math.floor((easedT * (x - fromX)) + fromX);
      }

      if (easedT < 1) {
        nativeRaf(step);

      } else {
        self._el.style.transform = ``;
        done();
      }
    }

    // start scroll loop
    self.isScrolling = true;

    // chill out for a frame first
    rafFrames(2, (timeStamp) => {
      startTime = timeStamp;
      step(timeStamp);
    });

    return promise;
  }

  scrollToTop(duration: number): Promise<any> {
    return this.scrollTo(0, 0, duration);
  }

  scrollToBottom(duration: number): Promise<any> {
    let y = 0;
    if (this._el) {
      y = this._el.scrollHeight - this._el.clientHeight;
    }
    return this.scrollTo(0, y, duration);
  }

  stop() {
    this.isScrolling = false;
  }

  /**
   * @private
   */
  destroy() {
    this.scrollStart.unsubscribe();
    this.scroll.unsubscribe();
    this.scrollEnd.unsubscribe();

    this.stop();
    this._scLsn();
    this._endTmr && this._endTmr();
    this._el = null;
  }

}


export interface ScrollEvent {
  type?: string;
  scrollTop?: number;
  scrollLeft?: number;
  scrollHeight?: number;
  startY?: number;
  startX?: number;
  deltaY?: number;
  deltaX?: number;
  domWrite?: DomFn;
  timeStamp?: number;
  velocityY?: number;
  velocityX?: number;
}


export interface DomFn {
  (callback: Function): void;
}


const MIN_VELOCITY_START_DECELERATION = 4;
const MIN_VELOCITY_CONTINUE_DECELERATION = 0.12;
const DECELERATION_FRICTION = 0.97;
const FRAME_MS = (1000 / 60);

const EVENT_SCROLL_START = 'scrollstart';
const EVENT_SCROLL = 'scroll';
const EVENT_SCROLL_END = 'scrollend';
