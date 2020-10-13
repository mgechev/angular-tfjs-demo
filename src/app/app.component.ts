import * as handTrack from 'handtrackjs';
import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

type Direction = 'left' | 'right' | 'none';
type Size = [number, number];
type Point = [number, number];
type Rect = [number, number, number, number];

class SwipeRecognizer {
  private _swipe$ = new BehaviorSubject<Direction>('none');
  readonly swipe$ = this._swipe$.asObservable();

  private _initiated = false;
  private _initialTimestamp = -1;
  private _stream: MediaStream;
  private _dimensions: Size;

  get stream(): MediaStream {
    return this._stream;
  }

  initialize(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
    const modelParams = {
      flipHorizontal: true,
      maxNumBoxes: 1,
      iouThreshold: 0.5,
      scoreThreshold: 0.4,
    };
    this._dimensions = [video.width, video.height];
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(stream => {
        this._stream = stream;
        return handTrack.load(modelParams);
      })
      .then(model => {
        const context = canvas.getContext('2d');
        const runDetection = () => {
          model.detect(video).then((predictions) => {
            model.renderPredictions(
              predictions,
              canvas,
              context,
              video
            );
            if (predictions[0]) {
              this._process(predictions[0].bbox);
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

  private _process(rect: Rect): void {
    const middle = this._getMiddle(rect);
    console.log(middle);
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
      this._swipe$.next('left');
      this._initiated = false;
      return;
    }
    if (
      this._inRegion(0.9, 1, middle) &&
      this._toSeconds(Date.now() - this._initialTimestamp) < 2
    ) {
      this._swipe$.next('right');
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
    return [rect[0] + (rect[0] / 2), rect[1] + (rect[3] / 2)];
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit {
  private recognizer = new SwipeRecognizer();
  @ViewChild('video') video: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvas: ElementRef<HTMLCanvasElement>;
  opened$ = this.recognizer.swipe$.pipe(map(value => value === 'right'));

  get stream(): MediaStream {
    return this.recognizer.stream;
  }

  ngAfterViewInit(): void {
    this.recognizer.initialize(this.canvas.nativeElement, this.video.nativeElement);
  }
}
