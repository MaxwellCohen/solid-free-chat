import { For } from 'solid-js'
import { Dynamic } from '@solidjs/web'
import type { JSX } from '@solidjs/web'

import checkCircle2 from 'lucide/dist/esm/icons/circle-check.mjs'
import chevronRight from 'lucide/dist/esm/icons/chevron-right.mjs'
import circleAlert from 'lucide/dist/esm/icons/circle-alert.mjs'
import fileText from 'lucide/dist/esm/icons/file-text.mjs'
import image from 'lucide/dist/esm/icons/image.mjs'
import keyRound from 'lucide/dist/esm/icons/key-round.mjs'
import keyboard from 'lucide/dist/esm/icons/keyboard.mjs'
import loaderCircle from 'lucide/dist/esm/icons/loader-circle.mjs'
import monitor from 'lucide/dist/esm/icons/monitor.mjs'
import moon from 'lucide/dist/esm/icons/moon.mjs'
import panelLeftClose from 'lucide/dist/esm/icons/panel-left-close.mjs'
import panelLeft from 'lucide/dist/esm/icons/panel-left.mjs'
import rotateCw from 'lucide/dist/esm/icons/rotate-cw.mjs'
import share2 from 'lucide/dist/esm/icons/share-2.mjs'
import squarePen from 'lucide/dist/esm/icons/square-pen.mjs'
import sun from 'lucide/dist/esm/icons/sun.mjs'
import wrench from 'lucide/dist/esm/icons/wrench.mjs'
import x from 'lucide/dist/esm/icons/x.mjs'

type IconNode = ReadonlyArray<readonly [string, Record<string, string>]>

export type IconProps = {
  class?: JSX.SVGAttributes<SVGSVGElement>['class']
  strokeWidth?: number | string
  'aria-hidden'?: 'true' | 'false'
}

function createIcon(icon: IconNode) {
  return function Icon(props: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width={props.strokeWidth ?? 2}
        stroke-linecap="round"
        stroke-linejoin="round"
        class={props.class}
        aria-hidden={props['aria-hidden']}
      >
        <For each={icon}>
          {([tag, attrs]) => <Dynamic component={tag} {...attrs} />}
        </For>
      </svg>
    )
  }
}

export const CheckCircle2 = createIcon(checkCircle2)
export const ChevronRight = createIcon(chevronRight)
export const CircleAlert = createIcon(circleAlert)
export const Computer = createIcon(monitor)
export const FileText = createIcon(fileText)
export const Image = createIcon(image)
export const KeyRound = createIcon(keyRound)
export const Keyboard = createIcon(keyboard)
export const LoaderCircle = createIcon(loaderCircle)
export const Moon = createIcon(moon)
export const PanelLeft = createIcon(panelLeft)
export const PanelLeftClose = createIcon(panelLeftClose)
export const RotateCw = createIcon(rotateCw)
export const Share2 = createIcon(share2)
export const SquarePen = createIcon(squarePen)
export const Sun = createIcon(sun)
export const Wrench = createIcon(wrench)
export const X = createIcon(x)
