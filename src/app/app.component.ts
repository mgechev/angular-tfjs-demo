import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { filter, map } from 'rxjs/operators';
import { HandGesture } from './hand-gesture.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit {
  @ViewChild('video') video: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas') canvas: ElementRef<HTMLCanvasElement>;
  opened$ = this._recognizer.swipe$.pipe(
    filter((value) => value === 'left' || value === 'right'),
    map((value) => value === 'right')
  );

  constructor(private _recognizer: HandGesture) {
    this._recognizer.swipe$.subscribe((d) => {
      console.log(d);
    });

    this._recognizer.gesture$.subscribe((d) => {
      console.log(d);
    });
  }

  get stream(): MediaStream {
    return this._recognizer.stream;
  }

  ngAfterViewInit(): void {
    this._recognizer.initialize(
      this.canvas.nativeElement,
      this.video.nativeElement
    );
  }
}
