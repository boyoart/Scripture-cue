export interface SpeechCaptureResult {
  transcript: string;
  source: "mock" | "browser";
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
};

type WindowWithSpeech = Window & {
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

export async function captureSpeech(): Promise<SpeechCaptureResult> {
  const browserWindow = window as WindowWithSpeech;
  const Recognition = browserWindow.webkitSpeechRecognition;

  if (!Recognition) {
    return { transcript: "Psalm 23:1-3", source: "mock" };
  }

  return new Promise((resolve) => {
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      resolve({ transcript, source: "browser" });
    };

    recognition.onerror = () => {
      resolve({ transcript: "Psalm 23:1-3", source: "mock" });
    };

    recognition.start();
  });
}
