import { ElementRef, Renderer } from '@angular/core';
import { Content } from '../../content/content';
import { Img, isValidSrc } from '../img';
import { ImgLoader } from '../img-loader';
import { ImgResponseMessage } from '../img-worker';
import { mockContent, mockElementRef, mockPlatform, mockRenderer, mockZone } from '../../../util/mock-providers';
import { Platform } from '../../../platform/platform';


fdescribe('Img', () => {

  describe('_loadResponse', () => {

    it('should set loaded(false) if error', () => {
      spyOn(img, '_loaded');
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 500,
        msg: 'error'
      };
      img._loadResponse(msg);

      expect(img._loaded).toHaveBeenCalledWith(false);
    });

    it('should set src attr empty if error', () => {
      spyOn(img, '_srcAttr');
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 500,
        msg: 'error'
      };
      img._loadResponse(msg);

      expect(img._srcAttr).toHaveBeenCalledWith('');
    });

    it('should null tmp data uri if error', () => {
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 500,
        msg: 'error'
      };
      img._loadResponse(msg);

      expect(img._tmpDataUri).toEqual(null);
    });

    it('should null pending src if error', () => {
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 500,
        msg: 'error'
      };
      img._loadResponse(msg);

      expect(img._pendingSrc).toEqual(null);
    });

    it('should null loaded src if error', () => {
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 500,
        msg: 'error'
      };
      img._loadResponse(msg);

      expect(img._loadedSrc).toEqual(null);
    });

    it('should call loaded(true) if not paused and status 200', () => {
      spyOn(img, '_loaded');
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 200,
        data: 'datauri'
      };
      img._loadResponse(msg);

      expect(img._loaded).toHaveBeenCalledWith(true);
    });

    it('should set src attr if not paused and status 200', () => {
      spyOn(img, '_srcAttr');
      img._pendingSrc = 'image.jpg';
      img._isPaused = false;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 200,
        data: 'datauri'
      };
      img._loadResponse(msg);

      expect(img._srcAttr).toHaveBeenCalledWith('datauri');
    });

    it('should set tmp datauri if paused and status 200', () => {
      spyOn(img, '_srcAttr');
      img._pendingSrc = 'image.jpg';
      img._isPaused = true;

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 200,
        data: 'datauri'
      };
      img._loadResponse(msg);

      expect(img._tmpDataUri).toEqual('datauri');
      expect(img._srcAttr).not.toHaveBeenCalled();
    });

    it('should null pending src if status 200', () => {
      img._pendingSrc = 'image.jpg';

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 200
      };
      img._loadResponse(msg);

      expect(img._pendingSrc).toEqual(null);
    });

    it('should set loaded src if status 200', () => {
      img._pendingSrc = 'image.jpg';

      const msg: ImgResponseMessage = {
        src: 'image.jpg',
        status: 200
      };
      img._loadResponse(msg);

      expect(img._loadedSrc).toEqual('image.jpg');
    });

    it('should do nothing if the worker response src is different than pending', () => {
      spyOn(img, '_loaded');
      img._pendingSrc = 'newPending.jpg';

      const msg: ImgResponseMessage = {
        src: 'oldPending.jpg'
      };
      img._loadResponse(msg);

      expect(img._loaded).not.toHaveBeenCalled();
    });

  });

  describe('_loadReqest, web worker true', () => {

    it('should not subscribe to loader update if already set', () => {
      img._sub = loader.update.subscribe(() => {});
      spyOn(loader.update, 'subscribe');

      img.webWorker = true;
      img._loadReqest('image.jpg');

      expect(loader.update.subscribe).not.toHaveBeenCalled();
      expect(img._sub).not.toEqual(null);
    });

    it('should subscribe to loader update if not already set', () => {
      spyOn(loader.update, 'subscribe');
      img._sub = null;

      img.webWorker = true;
      img._loadReqest('image.jpg');

      expect(loader.update.subscribe).toHaveBeenCalled();
      expect(img._sub).not.toEqual(null);
    });

    it('should call loader load', () => {
      spyOn(loader, 'load');

      img.webWorker = true;
      img.cache = true;
      img._loadReqest('image.jpg');

      expect(loader.load).toHaveBeenCalledWith('image.jpg', true);
    });

  });

  describe('_loadReqest, web worker false', () => {

    it('should null _tmpDataUri src', () => {
      img._tmpDataUri = 'datauri://';

      img.webWorker = false;
      img._loadReqest('image.jpg');

      expect(img._tmpDataUri).toEqual(null);
    });

    it('should null pending src', () => {
      img._pendingSrc = 'pending.jpg';

      img.webWorker = false;
      img._loadReqest('image.jpg');

      expect(img._pendingSrc).toEqual(null);
    });

    it('should set src attr', () => {
      spyOn(img, '_srcAttr');

      img.webWorker = false;
      img._loadReqest('image.jpg');

      expect(img._srcAttr).toHaveBeenCalledWith('image.jpg');
    });

    it('should call _loaded(true)', () => {
      spyOn(img, '_loaded');

      img.webWorker = false;
      img._loadReqest('image.jpg');

      expect(img._loaded).toHaveBeenCalledWith(true);
    });

  });

  describe('play', () => {

    it('should loadRequest if theres a pending src', () => {
      spyOn(img, '_loadReqest');

      img._pendingSrc = 'pending.jpg';
      img.play();

      expect(img._loadReqest).toHaveBeenCalledWith('pending.jpg');
    });

    it('should do nothing if _loadedSrc already set', () => {
      spyOn(img, '_loadReqest');
      spyOn(img, '_srcAttr');

      img._loadedSrc = 'loaded.jpg';

      expect(img._loadReqest).not.toHaveBeenCalled();
      expect(img._srcAttr).not.toHaveBeenCalled();
    });

    it('should set null tmp datauri if _tmpDataUri', () => {
      spyOn(img, '_srcAttr');

      img._tmpDataUri = 'datauri://...';
      img.play();

      expect(img._tmpDataUri).toEqual(null);
    });

    it('should set _srcAttr(true) when theres a tmp datauri', () => {
      spyOn(img, '_srcAttr');

      img._tmpDataUri = 'datauri://...';
      img.play();

      expect(img._srcAttr).toHaveBeenCalledWith('datauri://...');
    });

    it('should call _loaded(true) when theres a tmp datauri', () => {
      spyOn(img, '_loaded');

      img._tmpDataUri = 'datauri://...';
      img.play();

      expect(img._loaded).toHaveBeenCalledWith(true);
    });

    it('should set _isPaused false', () => {
      img._isPaused = true;
      img.play();
      expect(img._isPaused).toEqual(false);
    });

  });

  describe('pause', () => {

    it('should set _isPaused true', () => {
      img._isPaused = false;
      img.pause();
      expect(img._isPaused).toEqual(true);
    });

  });

  describe('ngOnInit', () => {

    it('should add img to content if lazy loaded', () => {
      img.lazyLoad = true;
      img.ngOnInit();

      expect(content._imgs[0]).toBe(img);
    });

    it('should not add img to content if lazy loaded', () => {
      img.lazyLoad = false;
      img.ngOnInit();

      expect(content._imgs.length).toEqual(0);
    });

    it('should not start loadRequest if invalid pending src', () => {
      spyOn(img, '_loadReqest');

      img.src = null;
      img.ngOnInit();

      expect(img._loadReqest).not.toHaveBeenCalled();
    });

    it('should start loadRequest if valid pending src', () => {
      spyOn(img, '_loadReqest');

      img.src = 'valid.jpg';
      img.ngOnInit();

      expect(img._loadReqest).toHaveBeenCalledWith('valid.jpg');
    });

    it('should set _init true', () => {
      img._init = false;
      img.ngOnInit();

      expect(img._init).toEqual(true);
    });

  });

  describe('src setter', () => {

    it('should do nothing if new value is same as loaded', () => {
      spyOn(img, '_loaded');

      img._loadedSrc = 'loaded.jpg';
      img.src = 'loaded.jpg';

      expect(img._loaded).not.toHaveBeenCalled();
    });

    it('should do nothing if new value is same as pending', () => {
      spyOn(img, '_loaded');

      img._pendingSrc = 'pending.jpg';
      img.src = 'pending.jpg';

      expect(img._loaded).not.toHaveBeenCalled();
    });

    it('should start load request if initialized', () => {
      spyOn(img, '_loadReqest');

      img._init = true;
      img.src = 'valid.jpg';

      expect(img._loadReqest).toHaveBeenCalledWith('valid.jpg');
    });

    it('should not start load request if not initialized', () => {
      spyOn(img, '_loadReqest');

      img._init = false;
      img.src = 'valid.jpg';

      expect(img._loadReqest).not.toHaveBeenCalled();
    });

    it('should null tmp datauri if set invalid src', () => {
      img._tmpDataUri = 'datauri://...';
      img.src = null;

      expect(img._tmpDataUri).toEqual(null);
    });

    it('should null tmp datauri if set src', () => {
      img._tmpDataUri = 'datauri://...';
      img.src = 'valid.jpg';

      expect(img._tmpDataUri).toEqual(null);
    });

    it('should null loaded src if set src', () => {
      img._loadedSrc = 'loaded.jpg';
      img.src = 'valid.jpg';

      expect(img._loadedSrc).toEqual(null);
    });

    it('should set pending if valid src', () => {
      img.src = 'valid.jpg';

      expect(img._pendingSrc).toEqual('valid.jpg');
    });

    it('should have called _loaded(false) for valid src', () => {
      spyOn(img, '_loaded');

      img.src = 'valid.jpg';

      expect(img._loaded).toHaveBeenCalledWith(false);
    });

    it('should have called _loaded(false) for invalid src', () => {
      spyOn(img, '_loaded');

      img.src = null;

      expect(img._loaded).toHaveBeenCalledWith(false);
    });

    it('should not abort if not pending src for invalid src', () => {
      spyOn(loader, 'abort');

      img._loadedSrc = 'loaded.jpg';
      img.src = null;

      expect(loader.abort).not.toHaveBeenCalled();
    });

    it('should abort pending src for invalid src', () => {
      spyOn(loader, 'abort');

      img._pendingSrc = 'pending.jpg';
      img.src = null;

      expect(loader.abort).toHaveBeenCalledWith('pending.jpg');
    });

    it('should not set pending src if not valid src', () => {
      img._pendingSrc = 'pending.jpg';
      img.src = null;
      expect(img._pendingSrc).toEqual(null);
    });

    it('should not set loading src if not valid src', () => {
      img._loadedSrc = 'loaded.jpg';
      img.src = null;
      expect(img._loadedSrc).toEqual(null);
    });

  });

  describe('src getter', () => {

    it('should get pending src if both set', () => {
      img._pendingSrc = 'pending.jpg';
      img._loadedSrc = 'loaded.jpg';
      expect(img.src).toEqual(img._pendingSrc);
    });

    it('should get loaded src if only loaded set', () => {
      img._pendingSrc = '';
      img._loadedSrc = 'loaded.jpg';
      expect(img.src).toEqual(img._loadedSrc);
    });

    it('should get pending src if only pending set', () => {
      img._pendingSrc = 'pending.jpg';
      img._loadedSrc = '';
      expect(img.src).toEqual(img._pendingSrc);
    });

  });

  describe('isValidSrc', () => {

    it('should be valid for any string', () => {
      expect(isValidSrc('image.jpg')).toEqual(true);
    });

    it('should not be valid for empty string', () => {
      expect(isValidSrc('')).toEqual(false);
    });

    it('should not be valid for undefined/null', () => {
      expect(isValidSrc(null)).toEqual(false);
      expect(isValidSrc(undefined)).toEqual(false);
    });

  });


  let img: Img;
  let loader: ImgLoader;
  let elementRef: ElementRef;
  let renderer: Renderer;
  let platform: Platform;
  let content: Content;

  beforeEach(() => {
    content = mockContent();
    loader = new ImgLoader();
    elementRef = mockElementRef();
    renderer = mockRenderer();
    platform = mockPlatform();
    img = new Img(loader, elementRef, renderer, platform, mockZone(), content);
  });

});
