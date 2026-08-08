import type { WebSocketData } from "s42-core";

export async function stopSharedListener(
  server: Bun.Server<WebSocketData>,
  activeConnectionsAtStop: number,
): Promise<void> {
  const pendingWebSocketsAtStop = server.pendingWebSockets;
  let nativeStopSettled = false;
  let nativeStopError: unknown;
  const nativeStop = server.stop(true);
  void nativeStop.then(
    () => {
      nativeStopSettled = true;
    },
    (cause) => {
      nativeStopError = cause;
      nativeStopSettled = true;
    },
  );

  if (activeConnectionsAtStop > 0 || pendingWebSocketsAtStop === 0) {
    await nativeStop;
  } else {
    // Bun 1.3.14 can retain a stale pendingWebSockets count after a socket closes.
    await Bun.sleep(0);
    while (!nativeStopSettled && server.pendingRequests > 0) await Bun.sleep(10);
  }

  if (nativeStopError) throw nativeStopError;
  server.unref();
}
