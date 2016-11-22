import { Subject } from 'rxjs/Subject';

import { assert } from './util';
import { CSS, pointerCoord, nativeRaf, nativeRafThrottle, rafFrames, cancelRaf } from '../util/dom';
import { eventOptions, listenEvent } from './ui-event-manager';


export class ScrollView {
  isScrolling = false;
  scrollStart = new Subject<ScrollEvent>();
  scroll = new Subject<ScrollEvent>();
  scrollEnd = new Subject<ScrollEvent>();

  private _el: HTMLElement;
  private _js: boolean = false;
  private _top: number = 0;
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

    const opts = eventOptions(false, true);

    this._scLsn = listenEvent(ele, EVENT_SCROLL, false, opts, nativeRafThrottle(() => {

      if (!this.isScrolling) {
        // currently not scrolling, so this is a scroll start
        this.isScrolling = true;
        this._scrollEvent(EVENT_SCROLL_START);

      } else {
        // still actively scrolling
        this._scrollEvent(EVENT_SCROLL);
      }

      // debounce then emit on the last scroll event
      this._endTmr && this._endTmr();
      this._endTmr = rafFrames(6, () => {
        // haven't scrolled in a while, so it's a scrollend
        this.isScrolling = false;
        this._scrollEvent(EVENT_SCROLL_END);
      });

    }));
  }

  /**
   * @private
   */
  private _scrollEvent(eventType: string) {
    const ev = this._ev;

    // double check we've cleared out callbacks
    this._domWrites.length = 0;

    ev.type = eventType;

    // get the current scrollTop
    // ******** DOM READ ****************
    ev.currentY = this.getTop();

    // get the current scrollLeft
    // ******** DOM READ ****************
    ev.currentX = this.getLeft();

    if (eventType === EVENT_SCROLL_START) {
      // remember the start positions
      ev.startY = ev.currentY;
      ev.startX = ev.currentX;

      // forget the deltas
      ev.deltaY = ev.deltaX = 0;

      // emit only on the first scroll event
      // ******** DOM READ (possible) ****************
      this.scrollStart.next(ev);
    }

    if (eventType === EVENT_SCROLL_START || eventType === EVENT_SCROLL) {
      ev.deltaY = (ev.currentY - ev.startY);
      ev.deltaX = (ev.currentX - ev.startX);

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
   * inertia then this can be burned to the ground.
   */
  enableJsScroll() {
    this._js = true;
    const ele = this._el;
    const positions: number[] = [];
    let velocity = 0;
    let rafId: number;
    let max: number;

    // stop listening for actual scroll events
    this._scLsn();


    const setMax = () => {
      if (!max) {
        // ******** DOM READ ****************
        max = (this._el.offsetHeight - this._el.parentElement.offsetHeight + this._el.parentElement.offsetTop);
      }
    };

    const decelerate = () => {
      console.debug(`scroll-view, decelerate, velocity: ${velocity}`);
      if (velocity) {
        velocity *= DECELERATION_FRICTION;

        // update top with updated velocity
        // clamp top within scroll limits
        this._top = Math.min(Math.max(this._top + velocity, 0), max);

        // ******** DOM READ THEN DOM WRITE ****************
        this._scrollEvent(EVENT_SCROLL);

        // ******** DOM WRITE ****************
        this.setTop(this._top);

        if (this._top > 0 && this._top < max && Math.abs(velocity) > MIN_VELOCITY_CONTINUE_DECELERATION) {
          rafId = nativeRaf(decelerate.bind(this));

        } else {
          this.isScrolling = false;
          this._scrollEvent(EVENT_SCROLL_END);
        }
      }
    };

    const touchStart = (ev: TouchEvent) => {
      velocity = 0;
      positions.length = 0;
      max = null;
      positions.push(pointerCoord(ev).y, Date.now());
    };

    const touchMove = nativeRafThrottle((ev: TouchEvent) =>  {
      if (!positions.length) {
        return;
      }

      if (!this.isScrolling) {
        this.isScrolling = true;
        this._scrollEvent(EVENT_SCROLL_START);
      }

      var y = pointerCoord(ev).y;

      // ******** DOM READ ****************
      setMax();

      this._top -= (y - positions[positions.length - 2]);

      this._top = Math.min(Math.max(this._top, 0), max);

      positions.push(y, Date.now());

      // ******** DOM READ THEN DOM WRITE ****************
      this._scrollEvent(EVENT_SCROLL);

      // ******** DOM WRITE ****************
      this.setTop(this._top);
    });

    const touchEnd = (ev: TouchEvent) => {
      // figure out what the scroll position was about 100ms ago
      velocity = 0;
      cancelRaf(rafId);

      if (!positions.length) return;

      var y = pointerCoord(ev).y;

      positions.push(y, Date.now());

      var endPos = (positions.length - 1);
      var startPos = endPos;
      var timeRange = (Date.now() - 100);

      // move pointer to position measured 100ms ago
      for (var i = endPos; i > 0 && positions[i] > timeRange; i -= 2) {
        startPos = i;
      }

      if (startPos !== endPos) {
        // compute relative movement between these two points
        let timeOffset = (positions[endPos] - positions[startPos]);
        let movedTop = (positions[startPos - 1] - positions[endPos - 1]);

        // based on XXms compute the movement to apply for each render step
        velocity = ((movedTop / timeOffset) * FRAME_MS);

        // verify that we have enough velocity to start deceleration
        if (Math.abs(velocity) > MIN_VELOCITY_START_DECELERATION) {
          // ******** DOM READ ****************
          setMax();

          rafId = nativeRaf(decelerate.bind(this));
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
    function step() {
      attempts++;

      if (!self._el || !self.isScrolling || attempts > maxAttempts) {
        self.isScrolling = false;
        self._el.style.transform = ``;
        done();
        return;
      }

      let time = Math.min(1, ((Date.now() - startTime) / duration));

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
    rafFrames(2, () => {
      startTime = Date.now();
      step();
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
  currentY?: number;
  currentX?: number;
  startY?: number;
  startX?: number;
  deltaY?: number;
  deltaX?: number;
  domWrite?: DomFn;
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
