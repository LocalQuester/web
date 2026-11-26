// 배경 제거(AI)를 메인 스레드 밖에서 실행합니다. 계산하는 동안에도 AR 화면이 멈추지 않아서,
// 배경 지우기 버튼을 누르자마자 AR을 다시 켜 둘 수 있습니다(AR은 터치 직후 몇 초 안에만 시작 가능).
import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";

self.addEventListener("message", async ({ data: { id, blob } }) => {
  try {
    const result = await removeBackground(blob, {
      model: "isnet_quint8",
      output: { format: "image/png" },
      progress: (key, current, total) => self.postMessage({ id, type: "progress", key, current, total })
    });
    self.postMessage({ id, type: "done", blob: result });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || String(error) });
  }
});
