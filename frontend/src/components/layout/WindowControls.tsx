import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    const syncState = async () => {
      try {
        const appWindow = getCurrentWindow()
        setIsMaximized(await appWindow.isMaximized())
        unlisten = await appWindow.onResized(async () => {
          try {
            setIsMaximized(await appWindow.isMaximized())
          } catch {
            const max = await invoke<boolean>('window_is_maximized').catch(() => false)
            setIsMaximized(max)
          }
        })
      } catch {
        const max = await invoke<boolean>('window_is_maximized').catch(() => false)
        setIsMaximized(max)
      }
    }
    void syncState()
    return () => {
      unlisten?.()
    }
  }, [])

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize()
    } catch {
      await invoke('window_minimize').catch(() => {})
    }
  }

  const handleToggleMaximize = async () => {
    try {
      await getCurrentWindow().toggleMaximize()
      const next = await getCurrentWindow().isMaximized().catch(() => !isMaximized)
      setIsMaximized(next)
    } catch {
      const next = await invoke<boolean>('window_toggle_maximize').catch(() => !isMaximized)
      setIsMaximized(next)
    }
  }

  const handleClose = async () => {
    try {
      await getCurrentWindow().close()
    } catch {
      await invoke('window_close').catch(() => {})
    }
  }

  return (
    <div className="flex items-center h-full select-none shrink-0 border-l border-neutral-800 bg-neutral-950">
      <button
        type="button"
        onClick={handleMinimize}
        tabIndex={-1}
        className="h-full px-3.5 flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 transition-colors cursor-pointer"
        title="Minimize"
        aria-label="Minimize window"
      >
        <Minus size={13} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={handleToggleMaximize}
        tabIndex={-1}
        className="h-full px-3.5 flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/80 transition-colors cursor-pointer"
        title={isMaximized ? 'Restore Down' : 'Maximize'}
        aria-label={isMaximized ? 'Restore Down' : 'Maximize window'}
      >
        {isMaximized ? (
          <Copy size={11} className="rotate-90" strokeWidth={1.75} />
        ) : (
          <Square size={11} strokeWidth={1.75} />
        )}
      </button>
      <button
        type="button"
        onClick={handleClose}
        tabIndex={-1}
        className="h-full px-3.5 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-red-600 transition-colors cursor-pointer"
        title="Close"
        aria-label="Close window"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
