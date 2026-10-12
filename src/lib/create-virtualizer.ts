import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  Virtualizer,
} from '@tanstack/virtual-core'
import type { VirtualizerOptions } from '@tanstack/virtual-core'
import { createEffect, createSignal, onSettled, untrack } from 'solid-js'

export type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'

type PartialKeys<T, Keys extends keyof T> = Omit<T, Keys> & Partial<Pick<T, Keys>>

/**
 * Solid 2 adapter for `@tanstack/virtual-core`.
 * `@tanstack/solid-virtual` still targets Solid 1 (`onMount`, `mergeProps`, `solid-js/store`).
 */
function createVirtualizerBase<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
>(
  options: VirtualizerOptions<TScrollElement, TItemElement>,
): Virtualizer<TScrollElement, TItemElement> {
  // Construction reads `options.count` once. Later updates go through the effect.
  const instance = untrack(() => {
    const created = new Virtualizer<TScrollElement, TItemElement>(options)
    created._willUpdate()
    return created
  })

  const [virtualItems, setVirtualItems] = createSignal(
    untrack(() => instance.getVirtualItems()),
  )
  const [totalSize, setTotalSize] = createSignal(untrack(() => instance.getTotalSize()))

  const publish = (next: Virtualizer<TScrollElement, TItemElement>) => {
    setVirtualItems(next.getVirtualItems())
    setTotalSize(next.getTotalSize())
  }

  const onChange: VirtualizerOptions<TScrollElement, TItemElement>['onChange'] = (
    next,
    sync,
  ) => {
    untrack(() => {
      next._willUpdate()
      publish(next)
      options.onChange?.(next, sync)
    })
  }

  untrack(() => {
    instance.setOptions({
      ...options,
      onChange,
    })
  })

  const handler: ProxyHandler<Virtualizer<TScrollElement, TItemElement>> = {
    get(target, prop, receiver) {
      if (prop === 'getVirtualItems') return () => virtualItems()
      if (prop === 'getTotalSize') return () => totalSize()
      const value = Reflect.get(target, prop, receiver) as unknown
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value
    },
  }

  const virtualizer = new Proxy(instance, handler)

  onSettled(() => {
    const cleanup = virtualizer._didMount()
    untrack(() => {
      virtualizer._willUpdate()
      publish(instance)
    })
    return cleanup
  })

  createEffect(
    () => options.count,
    (count) => {
      untrack(() => {
        virtualizer.setOptions({
          ...options,
          count,
          onChange,
        })
        virtualizer._willUpdate()
        publish(instance)
      })
    },
  )

  return virtualizer
}

export function createVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  options: PartialKeys<
    VirtualizerOptions<TScrollElement, TItemElement>,
    'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
  >,
): Virtualizer<TScrollElement, TItemElement> {
  // Copy descriptors so a `count` getter is not invoked in the component body.
  // The required fields live on `options`; defineProperties cannot express that.
  const resolved = Object.defineProperties(
    {
      observeElementRect,
      observeElementOffset,
      scrollToFn: elementScroll,
    },
    Object.getOwnPropertyDescriptors(options),
  )
  return createVirtualizerBase<TScrollElement, TItemElement>(
    resolved as VirtualizerOptions<TScrollElement, TItemElement>,
  )
}
