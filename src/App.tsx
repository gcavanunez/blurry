import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

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

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Subliminal Blur Studio</p>
          <h1>Paste or upload, then paint subtle blur.</h1>
          <p className="subtitle">
            Paste an image from your clipboard or upload a file. Drag your mouse
            to blur only the sections you want to hide.
          </p>
        </div>
        <div className="toolbar">
          <label className="button primary" htmlFor="image-upload">
            Upload image
          </label>
          <input
            id="image-upload"
            className="file-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          <button
            className="button secondary"
            type="button"
            onClick={handleCopyToClipboard}
            disabled={!hasImage}
          >
            Copy to clipboard
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={handleReset}
            disabled={!hasImage}
          >
            Reset
          </button>
        </div>
      </header>

      <section className="workspace">
        {hasImage ? (
          <>
            <div className="canvas-card">
              <canvas
                ref={canvasRef}
                className="canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
              />
              <div className="canvas-caption">
                Drag to apply a gentle blur.
              </div>
            </div>
            <aside className="controls">
              <div className="control">
                <div className="control-header">
                  <span>Brush size</span>
                  <span className="value">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min={18}
                  max={140}
                  value={brushSize}
                  onChange={(event) =>
                    setBrushSize(Number(event.target.value))
                  }
                />
                <p className="hint">Larger brushes cover more area quickly.</p>
              </div>
              <div className="control">
                <div className="control-header">
                  <span>Blur strength</span>
                  <span className="value">{blurStrength}px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={18}
                  value={blurStrength}
                  onChange={(event) =>
                    setBlurStrength(Number(event.target.value))
                  }
                />
                <p className="hint">Keep it low for a subliminal finish.</p>
              </div>
              {imageDetails && (
                <div className="meta">
                  <p>{imageDetails.name}</p>
                  <p>
                    {imageDetails.width} × {imageDetails.height}px
                  </p>
                </div>
              )}
              <div className="meta">
                <p>Paste shortcut</p>
                <p>Ctrl + V / ⌘ + V</p>
              </div>
            </aside>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-content">
              <h2>Paste an image to begin</h2>
              <p>
                Click anywhere on the page and paste an image from your
                clipboard, or upload a file to get started.
              </p>
              <p className="hint">Your image never leaves the browser.</p>
            </div>
          </div>
        )}
      </section>

      {statusMessage && <div className="status">{statusMessage}</div>}
      {clipboardDebug && (
        <div className="debug-panel">
          <p className="debug-title">Clipboard debug</p>
          <div className="debug-row">
            <span className="debug-label">Types</span>
            <span className="debug-value">
              {clipboardDebug.clipboardTypes.length
                ? clipboardDebug.clipboardTypes.join(', ')
                : 'none'}
            </span>
          </div>
          <div className="debug-row">
            <span className="debug-label">Items</span>
            <span className="debug-value">
              {clipboardDebug.itemTypes.length
                ? clipboardDebug.itemTypes.join(', ')
                : 'none'}
            </span>
          </div>
          <div className="debug-row">
            <span className="debug-label">Files</span>
            <span className="debug-value">
              {clipboardDebug.fileTypes.length
                ? clipboardDebug.fileTypes.join(', ')
                : 'none'}
            </span>
          </div>
          <div className="debug-row">
            <span className="debug-label">Image</span>
            <span className="debug-value">{clipboardDebug.fileSummary}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
