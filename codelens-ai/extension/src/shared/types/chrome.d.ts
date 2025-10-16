declare namespace chrome {
  export namespace sidePanel {
    export function open(options: { tabId?: number }): Promise<void>;
    export function setOptions(options: {
      tabId?: number;
      path?: string;
      enabled?: boolean;
    }): Promise<void>;
  }
}
