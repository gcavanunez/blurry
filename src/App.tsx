import { useCallback, useEffect, useRef, useState } from 'react'

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

const DEFAULT_BRUSH_SIZE = 52
const DEFAULT_BLUR_STRENGTH = 6

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blurredCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const isDrawingRef = useRef(false)

  const [imageDetails, setImageDetails] = useState<ImageDetails | null>(null)
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE)
  const [blurStrength, setBlurStrength] = useState(DEFAULT_BLUR_STRENGTH)
  const blurStrengthRef = useRef(blurStrength)
  const [statusMessage, setStatusMessage] = useState<string>('')
  const [clipboardDebug, setClipboardDebug] =
    useState<ClipboardDebug | null>(null)

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
  }, [])

  const updateBlurredCanvas = useCallback((strength: number) => {
    const image = imageRef.current
    const blurredCanvas = blurredCanvasRef.current
    if (!image || !blurredCanvas) return

    const context = blurredCanvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, blurredCanvas.width, blurredCanvas.height)
    context.filter = `blur(${strength}px)`
    context.drawImage(image, 0, 0)
    context.filter = 'none'
  }, [])

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

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const applyBlurAtPoint = useCallback(
    (point: { x: number; y: number }) => {
      const canvas = canvasRef.current
      const blurredCanvas = blurredCanvasRef.current
      if (!canvas || !blurredCanvas) return

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
        blurredCanvas,
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
    if (!blurredCanvasRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    isDrawingRef.current = true

    const point = getCanvasPoint(event)
    if (point) {
      applyBlurAtPoint(point)
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    event.preventDefault()

    const point = getCanvasPoint(event)
    if (point) {
      applyBlurAtPoint(point)
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    event.preventDefault()
    isDrawingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handlePointerLeave = () => {
    isDrawingRef.current = false
  }

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
      setStatusMessage('Clipboard copy failed. Try again.')
    }
  }

  const hasImage = Boolean(imageDetails)
  const buttonBaseClass =
    'inline-flex items-center justify-center gap-2 rounded-full border border-transparent px-[1.4rem] py-[0.65rem] text-[0.95rem] font-semibold transition duration-200 ease-out active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none max-[600px]:w-full'
  const primaryButtonClass = `${buttonBaseClass} bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.25)] hover:bg-blue-700`
  const secondaryButtonClass = `${buttonBaseClass} bg-white text-slate-800 border-slate-200 hover:border-slate-400`
  const ghostButtonClass = `${buttonBaseClass} bg-transparent text-slate-600 border-dashed border-slate-200 hover:border-slate-300`

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 antialiased">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 p-10 font-sans">
        <header className="flex flex-col gap-6">
          <div>
            <p className="m-0 mb-2 text-xs font-bold uppercase tracking-[0.32em] text-slate-500">
              Subliminal Blur Studio
            </p>
            <h1 className="m-0 text-[clamp(2rem,3.5vw,3rem)] font-semibold text-slate-900">
              Paste or upload, then paint subtle blur.
            </h1>
            <p className="m-0 mt-2.5 max-w-[640px] text-base text-slate-600">
              Paste an image from your clipboard or upload a file. Drag your mouse
              to blur only the sections you want to hide.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 max-[600px]:flex-col max-[600px]:items-stretch">
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

        <section className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_280px] max-[900px]:grid-cols-1">
          {hasImage ? (
            <>
              <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                <canvas
                  ref={canvasRef}
                  className="block h-auto w-full rounded-2xl border border-slate-200 bg-slate-50 touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                />
                <div className="text-sm text-slate-500">
                  Drag to apply a gentle blur.
                </div>
              </div>
              <aside className="flex flex-col gap-6 rounded-[20px] border border-slate-200 bg-white p-6">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>Brush size</span>
                    <span className="font-semibold text-blue-600">{brushSize}px</span>
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
                  <p className="m-0 text-sm text-slate-500">
                    Larger brushes cover more area quickly.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between font-semibold text-slate-900">
                    <span>Blur strength</span>
                    <span className="font-semibold text-blue-600">
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
                  <p className="m-0 text-sm text-slate-500">
                    Keep it low for a subliminal finish.
                  </p>
                </div>
                {imageDetails && (
                  <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="m-0">{imageDetails.name}</p>
                    <p className="m-0">
                      {imageDetails.width} × {imageDetails.height}px
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="m-0">Paste shortcut</p>
                  <p className="m-0">Ctrl + V / ⌘ + V</p>
                </div>
              </aside>
            </>
          ) : (
            <div className="col-span-full rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
              <div className="flex flex-col gap-2">
                <h2 className="m-0 text-2xl font-semibold text-slate-900">
                  Paste an image to begin
                </h2>
                <p className="m-0 text-base text-slate-600">
                  Click anywhere on the page and paste an image from your
                  clipboard, or upload a file to get started.
                </p>
                <p className="m-0 text-sm text-slate-500">
                  Your image never leaves the browser.
                </p>
              </div>
            </div>
          )}
        </section>

        {statusMessage && (
          <div className="w-fit rounded-full bg-slate-200 px-5 py-2.5 font-medium text-slate-900">
            {statusMessage}
          </div>
        )}
        {clipboardDebug && (
          <div className="flex max-w-[680px] flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
            <p className="m-0 text-sm font-semibold text-slate-900">
              Clipboard debug
            </p>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 text-sm">
              <span className="font-semibold text-slate-500">Types</span>
              <span className="break-words font-mono text-slate-700">
                {clipboardDebug.clipboardTypes.length
                  ? clipboardDebug.clipboardTypes.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 text-sm">
              <span className="font-semibold text-slate-500">Items</span>
              <span className="break-words font-mono text-slate-700">
                {clipboardDebug.itemTypes.length
                  ? clipboardDebug.itemTypes.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 text-sm">
              <span className="font-semibold text-slate-500">Files</span>
              <span className="break-words font-mono text-slate-700">
                {clipboardDebug.fileTypes.length
                  ? clipboardDebug.fileTypes.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 text-sm">
              <span className="font-semibold text-slate-500">Image</span>
              <span className="break-words font-mono text-slate-700">
                {clipboardDebug.fileSummary}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
