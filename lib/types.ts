export type Side = 'left' | 'right';
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Polygon = { x: number; y: number }[];
export type Seam = {
  top: number;
  bottom: number;
  confidence: number;
  method: 'gutter' | 'center' | 'manual' | 'vision';
};
export type Dimensions = { width: number; height: number };
export type TextSpan = {
  id: string;
  side: Side;
  text: string;
  words: { text: string; start: number; end: number; box: Box }[];
  confidence: number;
  polygon?: Polygon;
  paragraphStart?: boolean;
};
export type Annotation = {
  id: string;
  comment: string;
  type: string;
  anchors: {
    span_id: string;
    quote: string;
    side: Side;
    boxes: Box[];
    polygon?: Polygon;
  }[];
};
export type Spread = {
  id: string;
  sequence: number;
  created_at: number;
  revision: number;
  seam: Seam;
  width: number;
  height: number;
  left: Dimensions;
  right: Dimensions;
  status:
    | 'ready'
    | 'queued'
    | 'processing'
    | 'annotating'
    | 'annotated'
    | 'failed';
  pipeline?: {
    stage:
      | 'queued'
      | 'splitting'
      | 'ocr_left'
      | 'ocr_right'
      | 'context'
      | 'annotating'
      | 'complete'
      | 'failed';
    percent: number;
    updatedAt: number;
    splitReady: boolean;
    attempts: number;
  };
  error?: string;
  spans?: TextSpan[];
  annotations?: Annotation[];
  model?: string;
  promptVersion?: string;
  annotationWarning?: string;
  contextSources?: { spreadId: string; revision: number; sequence: number }[];
  ocrEngine?: string;
};
export type ScanSession = { id: string; created_at: number; spreads: Spread[] };
