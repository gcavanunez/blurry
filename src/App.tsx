import { useCallback, useEffect, useRef, useState } from 'react'
import { BlurFilter, Container, Renderer, Sprite, Texture } from 'pixi.js'
import { cn } from './utils'

type ImageDetails = {
  name: string
  width: number
  height: number
}

type ClipboardDebug = {
  clipboardTypes: string[]
  itemTypes: string[]
  fileTypes: string[]
  fileSummary: string
}

type TouchDebug = {
  count: number
  lastEvent: string
  lastPosition: string
  active: boolean
  entries: string[]
}

const DEFAULT_BRUSH_SIZE = 52
const DEFAULT_BLUR_STRENGTH = 6

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blurredCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const isDrawingRef = useRef(false)
  const activeInputRef = useRef<'pointer' | 'touch' | null>(null)
  const blurScratchRef = useRef<HTMLCanvasElement | null>(null)
  const blurSourceRef = useRef<HTMLCanvasElement | null>(null)
  const pixiRendererRef = useRef<Renderer | null>(null)
  const pixiStageRef = useRef<Container | null>(null)
  const pixiSpriteRef = useRef<Sprite | null>(null)
  const pixiBlurFilterRef = useRef<BlurFilter | null>(null)
  const pixiTextureRef = useRef<Texture | null>(null)
  const pixiImageRef = useRef<HTMLImageElement | null>(null)
  const touchEventCountRef = useRef(0)
  const touchDebugUpdateRef = useRef(0)

  const [imageDetails, setImageDetails] = useState<ImageDetails | null>(null)
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [blurStrength, setBlurStrength] = useState(DEFAULT_BLUR_STRENGTH)
  const blurStrengthRef = useRef(blurStrength)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [clipboardDebug, setClipboardDebug] =
    useState<ClipboardDebug | null>(null)
  const [touchDebug, setTouchDebug] = useState<TouchDebug | null>(null)

  const setupCanvases = useCallback((image: HTMLImageElement) => {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)

    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = image.naturalWidth
    sourceCanvas.height = image.naturalHeight
    sourceCanvas.getContext('2d')?.drawImage(image, 0, 0)
    sourceCanvasRef.current = sourceCanvas

    const blurredCanvas = document.createElement('canvas')
    blurredCanvas.width = image.naturalWidth
    blurredCanvas.height = image.naturalHeight
    blurredCanvasRef.current = blurredCanvas
    blurSourceRef.current = blurredCanvas
  }, [])

  const setupPixiPipeline = useCallback((image: HTMLImageElement) => {
    try {
      pixiRendererRef.current?.destroy(true)
      pixiTextureRef.current?.destroy(true)

      const renderer = new Renderer({
        width: image.naturalWidth,
        height: image.naturalHeight,
        backgroundAlpha: 0,
        antialias: true,
        preserveDrawingBuffer: true,
      })
      const stage = new Container()
      const texture = Texture.from(image)
      const sprite = new Sprite(texture)

      sprite.width = image.naturalWidth
      sprite.height = image.naturalHeight

      const blurFilter = new BlurFilter()
      blurFilter.blur = blurStrengthRef.current
      sprite.filters = [blurFilter]

      stage.addChild(sprite)

      pixiRendererRef.current = renderer
      pixiStageRef.current = stage
      pixiSpriteRef.current = sprite
      pixiBlurFilterRef.current = blurFilter
      pixiTextureRef.current = texture
      pixiImageRef.current = image
      blurSourceRef.current = renderer.view as HTMLCanvasElement

      return true
    } catch (error) {
      console.warn('[pixi] failed to setup blur pipeline', error)
      pixiRendererRef.current?.destroy(true)
      pixiRendererRef.current = null
      pixiStageRef.current = null
      pixiSpriteRef.current = null
      pixiBlurFilterRef.current = null
      pixiTextureRef.current?.destroy(true)
      pixiTextureRef.current = null
      pixiImageRef.current = null
      return false
    }
  }, [])

  const updateBlurredCanvas = useCallback(
    (strength: number) => {
      const image = imageRef.current
      const blurredCanvas = blurredCanvasRef.current
      if (!image || !blurredCanvas) return

      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
      const context = blurredCanvas.getContext('2d')
      const canUseCanvasFilter =
        context !== null && !isIOS && 'filter' in context

      if (!canUseCanvasFilter) {
        if (!pixiRendererRef.current || pixiImageRef.current !== image) {
          setupPixiPipeline(image)
        }

        const pixiRenderer = pixiRendererRef.current
        const pixiStage = pixiStageRef.current
        const pixiSprite = pixiSpriteRef.current
        const pixiBlurFilter = pixiBlurFilterRef.current

        if (pixiRenderer && pixiStage && pixiSprite && pixiBlurFilter) {
          pixiRenderer.resize(image.naturalWidth, image.naturalHeight)
          pixiSprite.width = image.naturalWidth
          pixiSprite.height = image.naturalHeight
          pixiBlurFilter.blur = strength
          pixiRenderer.render(pixiStage)
          blurSourceRef.current = pixiRenderer.view as HTMLCanvasElement
          return
        }
      }

      if (!context) return

      if (canUseCanvasFilter) {
        context.clearRect(0, 0, blurredCanvas.width, blurredCanvas.height)
        context.filter = `blur(${strength}px)`
        context.drawImage(image, 0, 0)
        context.filter = 'none'
        blurSourceRef.current = blurredCanvas
        return
      }

      const scale = Math.max(0.12, 1 - strength / 20)
      const scaledWidth = Math.max(1, Math.round(blurredCanvas.width * scale))
      const scaledHeight = Math.max(1, Math.round(blurredCanvas.height * scale))
      const passes = Math.max(1, Math.round(strength / 6))
      const scratchCanvas = blurScratchRef.current ??
        document.createElement('canvas')

      blurScratchRef.current = scratchCanvas
      scratchCanvas.width = scaledWidth
      scratchCanvas.height = scaledHeight

      const scratchContext = scratchCanvas.getContext('2d')
      if (!scratchContext) return

      scratchContext.imageSmoothingEnabled = true
      scratchContext.imageSmoothingQuality = 'high'
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'

      let source: CanvasImageSource = image

      for (let pass = 0; pass < passes; pass += 1) {
        scratchContext.clearRect(0, 0, scaledWidth, scaledHeight)
        scratchContext.drawImage(source, 0, 0, scaledWidth, scaledHeight)
        context.clearRect(0, 0, blurredCanvas.width, blurredCanvas.height)
        context.drawImage(
          scratchCanvas,
          0,
          0,
          blurredCanvas.width,
          blurredCanvas.height
        )
        source = blurredCanvas
      }

      blurSourceRef.current = blurredCanvas
    },
    [setupPixiPipeline]
  )

  const renderImageToCanvas = useCallback(
    (image: HTMLImageElement) => {
      const canvas = canvasRef.current

      if (!canvas) {
        console.warn('[canvas] missing image or canvas', {
          hasImage: Boolean(image),
          hasCanvas: Boolean(canvas),
        })
        return
      }

      setupCanvases(image)
      updateBlurredCanvas(blurStrengthRef.current)
      console.info('[canvas] rendered', {
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    },
    [setupCanvases, updateBlurredCanvas]
  )

  const loadImageFromBlob = useCallback((blob: Blob, name: string) => {
    if (!blob.size) {
      setStatusMessage('Image data was empty or blocked by the browser.')
      console.warn('[image] blob size is 0', { name, type: blob.type })
      return
    }

    setStatusMessage('Loading image...')
    console.info('[image] loading', { name, type: blob.type, size: blob.size })

    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      if (!image.naturalWidth || !image.naturalHeight) {
        setStatusMessage('Image decoded with no visible pixels.')
        console.warn('[image] decoded with zero size')
        return
      }
      imageRef.current = image
      setImageDetails({
        name,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
      setStatusMessage('Image ready. Drag to paint subtle blur.')
      console.info('[image] loaded', {
        name,
        type: blob.type,
        size: blob.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })

      requestAnimationFrame(() => {
        if (imageRef.current !== image) return
        renderImageToCanvas(image)
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      setStatusMessage('Could not load that image.')
      console.warn('[image] failed to load', { name, type: blob.type })
    }

    image.src = objectUrl
  }, [renderImageToCanvas])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    loadImageFromBlob(file, file.name)
    event.target.value = ''
  }

  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData
      if (!clipboardData) {
        setStatusMessage('Clipboard data is not available in this browser.')
        setClipboardDebug({
          clipboardTypes: [],
          itemTypes: [],
          fileTypes: [],
          fileSummary: 'unavailable',
        })
        console.warn('[paste] clipboardData unavailable')
        return
      }

      const clipboardTypes = Array.from(clipboardData.types)
      const itemTypes = Array.from(clipboardData.items).map(
        (item) => item.type || 'unknown'
      )
      const fileTypes = Array.from(clipboardData.files).map(
        (file) => file.type || file.name || 'unknown'
      )

      const fileFromFiles = Array.from(clipboardData.files).find((file) =>
        file.type.startsWith('image/')
      )
      const itemFromClipboard = Array.from(clipboardData.items).find((item) =>
        item.type.startsWith('image/')
      )
      const fileFromItems = itemFromClipboard?.getAsFile()
      const file = fileFromFiles ?? fileFromItems
      const fileSummary = file
        ? `${file.name || 'clipboard-image'} • ${file.type || 'unknown'} • ${file.size} bytes`
        : 'none'

      setClipboardDebug({
        clipboardTypes,
        itemTypes,
        fileTypes,
        fileSummary,
      })

      console.info('[paste] clipboard types', clipboardTypes)
      console.info('[paste] item types', itemTypes)
      console.info('[paste] file types', fileTypes)
      if (file) {
        console.info('[paste] image file', {
          name: file.name,
          type: file.type,
          size: file.size,
        })
      } else {
        console.info('[paste] no image file found')
      }

      if (!file) {
        setStatusMessage('Clipboard paste did not include an image.')
        return
      }

      event.preventDefault()
      loadImageFromBlob(file, file.name || 'Clipboard image')
    },
    [loadImageFromBlob]
  )

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  useEffect(() => {
    blurStrengthRef.current = blurStrength
    updateBlurredCanvas(blurStrength)
  }, [blurStrength, updateBlurredCanvas])

  const getCanvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      }
    },
    []
  )

  const getTouchPoint = useCallback(
    (event: TouchEvent) => {
      const touch = event.touches[0] ?? event.changedTouches[0]
      if (!touch) return null
      return getCanvasPoint(touch.clientX, touch.clientY)
    },
    [getCanvasPoint]
  )

  const recordTouchEvent = useCallback(
    (eventName: 'start' | 'move' | 'end' | 'cancel', event: TouchEvent) => {
      touchEventCountRef.current += 1

      const now =
        typeof performance === 'undefined' ? Date.now() : performance.now()
      if (eventName === 'move' && now - touchDebugUpdateRef.current < 120) {
        return
      }

      touchDebugUpdateRef.current = now

      const touch = event.touches[0] ?? event.changedTouches[0]
      const point = touch ? getCanvasPoint(touch.clientX, touch.clientY) : null
      const position = point
        ? `${Math.round(point.x)}, ${Math.round(point.y)}`
        : 'n/a'
      const touchCount = event.touches.length || event.changedTouches.length
      const timestamp = new Date().toLocaleTimeString()
      const entry = `${timestamp} • ${eventName} • ${position} • touches:${touchCount}`

      setTouchDebug((previous) => {
        const wasActive = previous?.active ?? false
        const active =
          eventName === 'start'
            ? true
            : eventName === 'end' || eventName === 'cancel'
              ? false
              : wasActive
        const entries = [entry, ...(previous?.entries ?? [])].slice(0, 6)

        return {
          count: touchEventCountRef.current,
          lastEvent: eventName,
          lastPosition: position,
          active,
          entries,
        }
      })
    },
    [getCanvasPoint]
  )

  const applyBlurAtPoint = useCallback(
    (point: { x: number; y: number }) => {
      const canvas = canvasRef.current
      const blurSource = blurSourceRef.current ?? blurredCanvasRef.current
      if (!canvas || !blurSource) return

      const context = canvas.getContext('2d')
      if (!context) return

      const radius = brushSize / 2
      const startX = Math.max(0, point.x - radius)
      const startY = Math.max(0, point.y - radius)
      const endX = Math.min(canvas.width, point.x + radius)
      const endY = Math.min(canvas.height, point.y + radius)
      const width = endX - startX
      const height = endY - startY

      context.save()
      context.beginPath()
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.clip()
      context.drawImage(
        blurSource,
        startX,
        startY,
        width,
        height,
        startX,
        startY,
        width,
        height
      )
      context.restore()
    },
    [brushSize]
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!blurSourceRef.current) return
    if (activeInputRef.current && activeInputRef.current !== 'pointer') return
    activeInputRef.current = 'pointer'
    if (event.cancelable) event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    isDrawingRef.current = true

    const point = getCanvasPoint(event.clientX, event.clientY)
    if (point) {
      applyBlurAtPoint(point)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activeInputRef.current !== 'pointer') return
    if (event.cancelable) event.preventDefault()

    const point = getCanvasPoint(event.clientX, event.clientY)
    if (point) {
      applyBlurAtPoint(point)
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeInputRef.current !== 'pointer') return
    if (event.cancelable) event.preventDefault()
    isDrawingRef.current = false
    activeInputRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const handlePointerLeave = () => {
    if (activeInputRef.current !== 'pointer') return
    isDrawingRef.current = false
    activeInputRef.current = null
  }

  const handlePointerCancel = () => {
    if (activeInputRef.current !== 'pointer') return
    isDrawingRef.current = false
    activeInputRef.current = null
  }

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!blurSourceRef.current) return
      recordTouchEvent('start', event)
      if (activeInputRef.current && activeInputRef.current !== 'touch') return
      activeInputRef.current = 'touch'
      if (event.cancelable) event.preventDefault()
      isDrawingRef.current = true

      const point = getTouchPoint(event)
      if (point) {
        applyBlurAtPoint(point)
      }
    },
    [applyBlurAtPoint, getTouchPoint, recordTouchEvent]
  )

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      recordTouchEvent('move', event)
      if (!isDrawingRef.current || activeInputRef.current !== 'touch') return
      if (event.cancelable) event.preventDefault()

      const point = getTouchPoint(event)
      if (point) {
        applyBlurAtPoint(point)
      }
    },
    [applyBlurAtPoint, getTouchPoint, recordTouchEvent]
  )

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      recordTouchEvent('end', event)
      if (activeInputRef.current !== 'touch') return
      if (event.cancelable) event.preventDefault()
      isDrawingRef.current = false
      activeInputRef.current = null
    },
    [recordTouchEvent]
  )

  const handleTouchCancel = useCallback(
    (event: TouchEvent) => {
      recordTouchEvent('cancel', event)
      if (activeInputRef.current !== 'touch') return
      isDrawingRef.current = false
      activeInputRef.current = null
    },
    [recordTouchEvent]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const options: AddEventListenerOptions = { passive: false }
    canvas.addEventListener('touchstart', handleTouchStart, options)
    canvas.addEventListener('touchmove', handleTouchMove, options)
    canvas.addEventListener('touchend', handleTouchEnd, options)
    canvas.addEventListener('touchcancel', handleTouchCancel, options)

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    imageDetails,
  ])

  const handleReset = () => {
    const sourceCanvas = sourceCanvasRef.current
    const canvas = canvasRef.current
    if (!sourceCanvas || !canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(sourceCanvas, 0, 0)
    setStatusMessage('Reset to the original image.')
  }

  const handlePasteFromClipboard = async () => {
    if (!navigator.clipboard || !('read' in navigator.clipboard)) {
      setStatusMessage('Clipboard read is not supported in this browser.')
      setClipboardDebug({
        clipboardTypes: [],
        itemTypes: [],
        fileTypes: [],
        fileSummary: 'unsupported',
      })
      return
    }

    setStatusMessage('Reading clipboard...')

    try {
      const clipboardItems = await navigator.clipboard.read()
      const itemTypes = clipboardItems.flatMap((item) => item.types)
      const clipboardTypes = Array.from(new Set(itemTypes))
      let blob: Blob | null = null
      let blobType = ''

      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (!imageType) continue
        blobType = imageType
        blob = await item.getType(imageType)
        break
      }

      const fileTypes = blob ? [blob.type || blobType || 'unknown'] : []
      const fileSummary = blob
        ? `clipboard-image • ${blob.type || blobType || 'unknown'} • ${blob.size} bytes`
        : 'none'

      setClipboardDebug({
        clipboardTypes,
        itemTypes,
        fileTypes,
        fileSummary,
      })

      console.info('[paste] clipboard read types', clipboardTypes)
      console.info('[paste] clipboard read item types', itemTypes)

      if (!blob) {
        console.info('[paste] clipboard read no image')
        setStatusMessage('Clipboard did not include an image.')
        return
      }

      console.info('[paste] clipboard read image', {
        type: blob.type || blobType,
        size: blob.size,
      })
      loadImageFromBlob(blob, 'Clipboard image')
    } catch (error) {
      console.warn('[paste] clipboard read failed', error)
      setStatusMessage('Clipboard read failed. Check permissions.')
    }
  }

  const handleCopyToClipboard = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setStatusMessage('Preparing blurred image...')

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    )

    if (!blob) {
      setStatusMessage('Could not export the image.')
      return
    }

    if (!navigator.clipboard || !('ClipboardItem' in window)) {
      setStatusMessage('Clipboard image copy is not supported here.')
      return
    }

    try {
      const clipboardItem = new ClipboardItem({ [blob.type]: blob })
      await navigator.clipboard.write([clipboardItem])
      setStatusMessage('Blurred image copied to clipboard.')
    } catch (error) {
      console.warn('[clipboard] copy failed', error)
      setStatusMessage('Clipboard copy failed. Try again.')
    }
  }

  const hasImage = Boolean(imageDetails)
  const isMobile =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0))
  const buttonBaseClass =
    'inline-flex w-full items-center justify-center gap-2 rounded-full border border-transparent px-6 py-2.5 text-base font-semibold active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none sm:w-auto'
  const primaryButtonClass = cn(
    buttonBaseClass,
    'bg-blue-600 text-white shadow-md hover:bg-blue-700'
  )
  const secondaryButtonClass = cn(
    buttonBaseClass,
    'bg-white text-slate-800 border-slate-200 hover:border-slate-400'
  )
  const ghostButtonClass = cn(
    buttonBaseClass,
    'bg-transparent text-slate-600 border-dashed border-slate-200 hover:border-slate-300'
  )

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 antialiased">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 p-6 font-sans sm:p-10">
        <header className="flex flex-col gap-6">
          <div>
            <p className="m-0 mb-2 text-pretty text-xs font-semibold uppercase text-slate-500">
              Subliminal Blur Studio
            </p>
            <h1 className="m-0 text-balance text-3xl font-semibold text-slate-900 sm:text-4xl lg:text-5xl">
              Paste or upload, then paint subtle blur.
            </h1>
            <p className="m-0 mt-2.5 max-w-2xl text-pretty text-base text-slate-600">
              Paste an image from your clipboard or upload a file. Drag your mouse
              or finger to blur only the sections you want to hide.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label className={primaryButtonClass} htmlFor="image-upload">
              Upload image
            </label>
            <input
              id="image-upload"
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            <button
              className={cn(secondaryButtonClass, 'sm:hidden')}
              type="button"
              onClick={handlePasteFromClipboard}
            >
              Paste from clipboard
            </button>
            <button
              className={secondaryButtonClass}
              type="button"
              onClick={handleCopyToClipboard}
              disabled={!hasImage}
            >
              Copy to clipboard
            </button>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={handleReset}
              disabled={!hasImage}
            >
              Reset
            </button>
          </div>
        </header>

        <section className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {hasImage ? (
            <>
              <div className="flex flex-1 flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
                <canvas
                  ref={canvasRef}
                  className="block h-auto w-full rounded-2xl border border-slate-200 bg-slate-50 touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  onPointerCancel={handlePointerCancel}
                />
                <div className="text-pretty text-sm text-slate-500">
                  Drag or swipe to apply a gentle blur.
                </div>
              </div>
              <aside className="flex w-full flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 lg:w-72 lg:shrink-0">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>Brush size</span>
                    <span className="font-semibold tabular-nums text-blue-600">
                      {brushSize}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={18}
                    max={140}
                    value={brushSize}
                    className="w-full accent-blue-600"
                    onChange={(event) =>
                      setBrushSize(Number(event.target.value))
                    }
                  />
                  <p className="m-0 text-pretty text-sm text-slate-500">
                    Larger brushes cover more area quickly.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>Blur strength</span>
                    <span className="font-semibold tabular-nums text-blue-600">
                      {blurStrength}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={18}
                    value={blurStrength}
                    className="w-full accent-blue-600"
                    onChange={(event) =>
                      setBlurStrength(Number(event.target.value))
                    }
                  />
                  <p className="m-0 text-pretty text-sm text-slate-500">
                    Keep it low for a subliminal finish.
                  </p>
                </div>
                {imageDetails && (
                  <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-pretty text-sm text-slate-600">
                    <p className="m-0 text-pretty truncate">
                      {imageDetails.name}
                    </p>
                    <p className="m-0 text-pretty tabular-nums">
                      {imageDetails.width} × {imageDetails.height}px
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-pretty text-sm text-slate-600">
                  <p className="m-0 text-pretty">Paste shortcut</p>
                  <p className="m-0 text-pretty">Ctrl + V / ⌘ + V</p>
                </div>
              </aside>
            </>
          ) : (
            <div className="w-full rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
              <div className="flex flex-col gap-2">
                <h2 className="m-0 text-balance text-2xl font-semibold text-slate-900">
                  Paste an image to begin
                </h2>
                <p className="m-0 text-pretty text-base text-slate-600">
                  Click anywhere on the page and paste an image from your
                  clipboard, or upload a file to get started.
                </p>
                <p className="m-0 text-pretty text-sm text-slate-500">
                  Your image never leaves the browser.
                </p>
              </div>
            </div>
          )}
        </section>

        {statusMessage && (
          <div className="w-fit rounded-full bg-slate-200 px-5 py-2.5 text-pretty font-medium text-slate-900">
            {statusMessage}
          </div>
        )}
        {clipboardDebug && (
          <div className="flex max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-pretty text-slate-600">
            <p className="m-0 text-pretty text-sm font-semibold text-slate-900">
              Clipboard debug
            </p>
            <div className="flex items-start gap-3 text-sm">
              <span className="w-20 font-semibold text-slate-500">Types</span>
              <span className="break-words font-mono tabular-nums text-slate-700">
                {clipboardDebug.clipboardTypes.length
                  ? clipboardDebug.clipboardTypes.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="w-20 font-semibold text-slate-500">Items</span>
              <span className="break-words font-mono tabular-nums text-slate-700">
                {clipboardDebug.itemTypes.length
                  ? clipboardDebug.itemTypes.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="w-20 font-semibold text-slate-500">Files</span>
              <span className="break-words font-mono tabular-nums text-slate-700">
                {clipboardDebug.fileTypes.length
                  ? clipboardDebug.fileTypes.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <span className="w-20 font-semibold text-slate-500">Image</span>
              <span className="break-words font-mono tabular-nums text-slate-700">
                {clipboardDebug.fileSummary}
              </span>
            </div>
          </div>
        )}
        {isMobile && touchDebug && (
          <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-72 rounded-2xl bg-slate-900/90 p-3 text-xs text-slate-100 shadow-lg">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-slate-300">
              <span>Touch debug</span>
              <span>{touchDebug.active ? 'active' : 'idle'}</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Last</span>
                <span className="font-mono text-[11px] text-slate-100">
                  {touchDebug.lastEvent} @ {touchDebug.lastPosition}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Count</span>
                <span className="font-mono text-[11px] text-slate-100">
                  {touchDebug.count}
                </span>
              </div>
            </div>
            {touchDebug.entries.length > 0 && (
              <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                {touchDebug.entries.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="font-mono">
                    {entry}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
