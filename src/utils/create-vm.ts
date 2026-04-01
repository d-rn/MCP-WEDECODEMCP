import { VM, VMOptions } from "vm2";
import { JSDOM } from "jsdom";
import { deepmerge } from "@biggerstar/deepmerge";
import { createWxFakeDom } from "@/utils/wx-dom";

function bindInstanceMethods<T extends object>(target: T) {
  const seen = new Set<string>();
  let current: object | null = target;

  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === "constructor" || seen.has(key)) continue;
      seen.add(key);

      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || typeof descriptor.value !== "function") continue;

      try {
        Object.defineProperty(target, key, {
          configurable: true,
          writable: true,
          value: descriptor.value.bind(target),
        });
      } catch {
        // Ignore methods that cannot be rebound on the instance.
      }
    }
    current = Object.getPrototypeOf(current);
  }

  return target;
}

function bindDocumentFactories(document: Document) {
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = ((...args: Parameters<Document['createElement']>) => {
    return bindInstanceMethods(originalCreateElement(...args));
  }) as Document['createElement'];

  const originalCreateElementNS = document.createElementNS.bind(document);
  document.createElementNS = ((...args: Parameters<Document['createElementNS']>) => {
    return bindInstanceMethods(originalCreateElementNS(...args));
  }) as Document['createElementNS'];

  const originalCreateDocumentFragment = document.createDocumentFragment.bind(document);
  document.createDocumentFragment = ((...args: Parameters<Document['createDocumentFragment']>) => {
    return bindInstanceMethods(originalCreateDocumentFragment(...args));
  }) as Document['createDocumentFragment'];

  return document;
}

export function createVM(vmOptions: VMOptions = {}) {
  const domBaseHtml = `<!DOCTYPE html><html lang="en"><head><title>''</title></head><body></body></html>`
  const dom = new JSDOM(domBaseHtml);
  const vm_window = bindInstanceMethods(dom.window)
  const vm_navigator = dom.window.navigator
  const vm_document = bindInstanceMethods(dom.window.document)
  bindDocumentFactories(vm_document)
  if (vm_document.head) {
    bindInstanceMethods(vm_document.head)
  }
  if (vm_document.body) {
    bindInstanceMethods(vm_document.body)
  }
  const __wxAppCode__ = {}
  const fakeGlobal = {
    __wxAppCode__,
    publishDomainComponents: () => void 0,
  }
  Object.assign(vm_window, fakeGlobal)
  return new VM(deepmerge({
    sandbox: {
      ...createWxFakeDom(),
      setInterval: () => null,
      setTimeout: () => null,
      console: {
        ...console,  // 在 vm 执行的时候，对于小程序源码中的 info, log, warn 打印直接忽略
        log: ()=> void 0,
        warn: ()=> void 0,
        info: ()=> void 0,
      },
      window: vm_window,
      location: dom.window.location,
      navigator: vm_navigator,
      document: vm_document,
      define: () => void 0,
      require: () => void 0,
      requirePlugin: () => void 0,
      global: {
        __wcc_version__: 'v0.5vv_20211229_syb_scopedata',
      },
      System: {
        register: () => void 0,
      },
      __vd_version_info__: {},
      __wxAppCode__,
      __wxCodeSpace__: {
        setRuntimeGlobals: () => void 0,
        addComponentStaticConfig: () => void 0,
        setStyleScope: () => void 0,
        enableCodeChunk: () => void 0,
        initializeCodeChunk: () => void 0,
        addTemplateDependencies: () => void 0,
        batchAddCompiledScripts: () => void 0,
        batchAddCompiledTemplate: () => void 0,
      },
    }
  }, vmOptions));
}

export function runVmCode(vm: VM, code: string) {
  try {
    vm.run(code)
  } catch (e) {
    console.error(e.message)
  }
}
