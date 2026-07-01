import { inject, type InjectionKey } from "vue";

export type DesktopPageContext = Record<string, any>;

export const desktopPageContextKey: InjectionKey<DesktopPageContext> = Symbol(
  "DesktopPageContext",
);

export function useDesktopPageContext(): DesktopPageContext {
  const context = inject(desktopPageContextKey);
  if (!context) {
    throw new Error("DesktopPageContext is not available");
  }
  return context;
}
