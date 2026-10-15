// Count only genuinely new, incoming messages after the first successful
// snapshot. Old unread conversations display their badge without replaying
// sounds on reload. The tracker contains no personal data or network state.
export function createIncomingMessageTracker() {
  let conversation = null;
  let lastMessageId = 0n;
  return {
    check(key, messages) {
      if (!key || !Array.isArray(messages)) return 0;
      let newest = 0n, incoming = 0;
      const firstSnapshot = conversation !== key;
      for (const message of messages) {
        if (message?.id === undefined || !/^\d+$/.test(String(message.id))) continue;
        const id = BigInt(message.id);
        if (id > newest) newest = id;
        if (!firstSnapshot && id > lastMessageId && !message.mine) incoming++;
      }
      if (firstSnapshot) {
        conversation = key;
        lastMessageId = newest;
        return 0;
      }
      if (newest > lastMessageId) lastMessageId = newest;
      return incoming;
    },
    reset() {
      conversation = null;
      lastMessageId = 0n;
    }
  };
}
