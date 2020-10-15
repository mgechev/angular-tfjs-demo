import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as handpose from '@tensorflow-models/handpose';
import * as fingerpose from 'fingerpose';

import '@tensorflow/tfjs-backend-webgl';

const GestureMap = {
  thumbs_up: 'ok',
  victory: 'two',
  one_finger: 'one',
};

type Gesture = 'one' | 'two' | 'ok' | 'none';
type Direction = 'left' | 'right' | 'none';
type Size = [number, number];
type Point = [number, number];
type Rect = { topLeft: [number, number]; bottomRight: [number, number] };

const oneFingerGesture = new fingerpose.GestureDescription('one_finger');
oneFingerGesture.addCurl(
  fingerpose.Finger.Index,
  fingerpose.FingerCurl.NoCurl,
  1.0
);
oneFingerGesture.addCurl(
  fingerpose.Finger.Thumb,
  fingerpose.FingerCurl.FullCurl,
  1.0
);
oneFingerGesture.addCurl(
  fingerpose.Finger.Middle,
  fingerpose.FingerCurl.FullCurl,
  1.0
);
oneFingerGesture.addCurl(
  fingerpose.Finger.Ring,
  fingerpose.FingerCurl.FullCurl,
  1.0
);
oneFingerGesture.addCurl(
  fingerpose.Finger.Pinky,
  fingerpose.FingerCurl.FullCurl,
  1.0
);

const GE = new fingerpose.GestureEstimator([
  fingerpose.Gestures.VictoryGesture,
  fingerpose.Gestures.ThumbsUpGesture,
  oneFingerGesture,
]);

@Injectable({
  providedIn: 'root',
})
export class HandGesture {
  private _swipe$ = new BehaviorSubject<Direction>('none');
  readonly swipe$ = this._swipe$.asObservable();

  private _gesture$ = new BehaviorSubject<Gesture>('none');
  readonly gesture$ = this._gesture$.asObservable();

  private _initiated = false;
  private _initialTimestamp = -1;
  private _stream: MediaStream;
  private _dimensions: Size;
  private _lastGestureTiemstamp = -1;
  private _lastGesture = null;
  private _emitGesture = true;

  get stream(): MediaStream {
    return this._stream;
  }

  initialize(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
    this._dimensions = [video.width, video.height];
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        this._stream = stream;
        return handpose.load();
      })
      .then((model) => {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, video.width, video.height);
        context.strokeStyle = 'red';
        context.fillStyle = 'red';

        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        const runDetection = () => {
          model.estimateHands(video).then((predictions) => {
            // Render
            context.drawImage(
              video,
              0,
              0,
              video.width,
              video.height,
              0,
              0,
              canvas.width,
              canvas.height
            );
            if (predictions && predictions[0]) {
              drawKeypoints(context, predictions[0].landmarks);
              this._process(predictions[0].boundingBox);
              this._processGesture(predictions[0].landmarks);
            }
            requestAnimationFrame(runDetection);
          });
        };
        runDetection();
      })
      .catch((err) => {
        console.error(err);
      });
  }

  private _processGesture(landmarks: any): void {
    const { gestures } = GE.estimate(landmarks, 7.5) || [];
    let gesture = null;
    for (const g of gestures) {
      if (g.name === 'victory' || g.name === 'thumbs_up') {
        gesture = g.name;
        break;
      }
    }
    if (!gesture && gestures.length) {
      gesture = 'one_finger';
    }
    if (this._lastGesture !== gesture) {
      this._lastGesture = gesture;
      this._lastGestureTiemstamp = Date.now();
      this._emitGesture = true;
    } else {
      if (
        this._emitGesture &&
        this._toSeconds(Date.now() - this._lastGestureTiemstamp) > 1
      ) {
        this._gesture$.next(GestureMap[this._lastGesture]);
        this._emitGesture = false;
      }
    }
  }

  private _process(rect: Rect): void {
    const middle = this._getMiddle(rect);
    if (this._aroundCenter(middle)) {
      this._initialTimestamp = Date.now();
      this._initiated = true;
      return;
    }
    if (!this._initiated) {
      return;
    }
    if (
      this._inRegion(0, 0.1, middle) &&
      this._toSeconds(Date.now() - this._initialTimestamp) < 2
    ) {
      this._swipe$.next('right');
      this._initiated = false;
      return;
    }
    if (
      this._inRegion(0.9, 1, middle) &&
      this._toSeconds(Date.now() - this._initialTimestamp) < 2
    ) {
      this._swipe$.next('left');
      this._initiated = false;
      return;
    }
  }

  private _toSeconds(ms: number): number {
    return ms / 1000;
  }

  private _aroundCenter(center: Point): boolean {
    return this._inRegion(0.4, 0.6, center);
  }

  private _inRegion(start: number, end: number, point: Point): boolean {
    return (
      this._dimensions[0] * start < point[0] &&
      this._dimensions[0] * end > point[0]
    );
  }

  private _getMiddle(rect: Rect): Point {
    return [
      rect.topLeft[0] + (rect.topLeft[0] + rect.bottomRight[0]) / 2,
      rect.topLeft[1] + (rect.topLeft[1] + rect.bottomRight[1]) / 2,
    ];
  }
}

const fingerLookupIndices = {
  thumb: [0, 1, 2, 3, 4],
  indexFinger: [0, 5, 6, 7, 8],
  middleFinger: [0, 9, 10, 11, 12],
  ringFinger: [0, 13, 14, 15, 16],
  pinky: [0, 17, 18, 19, 20],
};

function drawPoint(ctx, y, x, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fill();
}

function drawKeypoints(ctx, keypoints) {
  const keypointsArray = keypoints;

  for (let i = 0; i < keypointsArray.length; i++) {
    const y = keypointsArray[i][0];
    const x = keypointsArray[i][1];
    drawPoint(ctx, x - 2, y - 2, 3);
  }

  const fingers = Object.keys(fingerLookupIndices);
  // tslint:disable-next-line: prefer-for-of
  for (let i = 0; i < fingers.length; i++) {
    const finger = fingers[i];
    const points = fingerLookupIndices[finger].map((idx) => keypoints[idx]);
    drawPath(ctx, points, false);
  }
}

function drawPath(ctx, points, closePath) {
  const region = new Path2D();
  region.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    region.lineTo(point[0], point[1]);
  }

  if (closePath) {
    region.closePath();
  }
  ctx.stroke(region);
}
