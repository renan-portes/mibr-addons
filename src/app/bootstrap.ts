import { getDefaultChannelStore, ChannelStore } from "../tv/channelStore.js";
import { StreamProxy } from "../tv/streamProxy.js";

export function getChannelStore(): ChannelStore {
  return getDefaultChannelStore();
}

export function getStreamProxy(): StreamProxy {
  return new StreamProxy(getDefaultChannelStore());
}
