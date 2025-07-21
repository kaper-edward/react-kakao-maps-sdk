import React, {
  createContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import ReactDOM from "react-dom"
import { useMap } from "../hooks/useMap"
import { useKakaoEvent } from "../hooks/useKakaoEvent"
import type { MarkerProps } from "./Marker"
import type { CustomOverlayMapProps } from "./CustomOverlayMap"

// --- 로깅 유틸리티 ---
const IS_DEBUG_MODE = true // 이 값을 false로 바꾸면 모든 로그가 비활성화됩니다.

const log = (
  message: string,
  style: "info" | "success" | "warning" | "error" = "info",
  ...args: any[]
) => {
  if (!IS_DEBUG_MODE) return

  let color = "black"
  switch (style) {
    case "success":
      color = "green"
      break
    case "warning":
      color = "orange"
      break
    case "error":
      color = "red"
      break
    case "info":
    default:
      color = "#007bff" // blue
      break
  }

  console.log(
    `%c[MarkerClusterer] ${message}`,
    `color: ${color}; font-weight: bold;`,
    ...args,
  )
}

// --- 타입 정의 ---
type ChildType = "Marker" | "CustomOverlayMap"
type ChildProps =
  | (MarkerProps & { children?: React.ReactNode })
  | CustomOverlayMapProps
interface ChildDescriptor {
  id: number
  type: ChildType
  props: ChildProps
  children?: React.ReactNode
}
interface MarkerRegistry {
  register(descriptor: ChildDescriptor): void
  unregister(id: number): void
  update(id: number, newProps: ChildProps, children?: React.ReactNode): void
}

export const MarkerClustererContext = createContext<MarkerRegistry | null>(null)

export type MarkerClustererProps = React.PropsWithChildren<{
  gridSize?: number
  averageCenter?: boolean
  minLevel?: number
  minClusterSize?: number
  styles?: React.CSSProperties[] | object[]
  texts?: string[] | ((size: number) => string)
  calculator?: number[] | ((size: number) => number[])
  disableClickZoom?: boolean
  clickable?: boolean
  hoverable?: boolean
  onClusterclick?: (
    target: kakao.maps.MarkerClusterer,
    cluster: kakao.maps.Cluster,
  ) => void
  onClusterover?: (
    target: kakao.maps.MarkerClusterer,
    cluster: kakao.maps.Cluster,
  ) => void
  onClusterout?: (
    target: kakao.maps.MarkerClusterer,
    cluster: kakao.maps.Cluster,
  ) => void
  onClusterdblclick?: (
    target: kakao.maps.MarkerClusterer,
    cluster: kakao.maps.Cluster,
  ) => void
  onClusterrightclick?: (
    target: kakao.maps.MarkerClusterer,
    cluster: kakao.maps.Cluster,
  ) => void
  onClustered?: (
    target: kakao.maps.MarkerClusterer,
    clusters: kakao.maps.Cluster[],
  ) => void
  onCreate?: (target: kakao.maps.MarkerClusterer) => void
}>

// --- 컴포넌트 구현 ---

export const MarkerClusterer = React.forwardRef<
  kakao.maps.MarkerClusterer,
  MarkerClustererProps
>(function MarkerClusterer({ children, ...props }, ref) {
  log("Component Rendering...")
  const map = useMap("MarkerClusterer")
  const [clusterer, setClusterer] = useState<kakao.maps.MarkerClusterer>()
  const [portals, setPortals] = useState<
    { id: number; container: HTMLElement; children: React.ReactNode }[]
  >([])

  const {
    gridSize,
    averageCenter,
    minLevel,
    minClusterSize,
    styles,
    texts,
    calculator,
    disableClickZoom,
    clickable,
    hoverable,
    onClusterclick,
    onClusterover,
    onClusterout,
    onClusterdblclick,
    onClusterrightclick,
    onClustered,
    onCreate,
  } = props

  const markerDescriptorsRef = useRef(new Map<number, ChildDescriptor>())
  const kakaoInstancesRef = useRef(
    new Map<number, kakao.maps.Marker | kakao.maps.CustomOverlay>(),
  )
  const changesQueueRef = useRef(new Map<number, ChildDescriptor | null>())

  // 클러스터러 인스턴스 생성 및 소멸 관리
  useEffect(() => {
    if (!map) return

    log("Creating kakao.maps.MarkerClusterer instance...")
    const newClusterer = new kakao.maps.MarkerClusterer({
      map,
      gridSize,
      averageCenter,
      minLevel,
      minClusterSize,
      styles,
      texts,
      calculator,
      disableClickZoom,
      clickable,
      hoverable,
    })
    setClusterer(newClusterer)
    log("Instance CREATED.", "success", newClusterer)
    onCreate?.(newClusterer)

    return () => {
      log("Cleaning up kakao.maps.MarkerClusterer instance.", "warning")
      newClusterer.clear()
    }
  }, [
    map,
    gridSize,
    averageCenter,
    minLevel,
    minClusterSize,
    styles,
    texts,
    calculator,
    disableClickZoom,
    clickable,
    hoverable,
    onCreate,
  ])

  // 변경 사항을 일괄 처리(Flush)하는 핵심 Effect
  useEffect(() => {
    log(
      "useEffect for flush triggered. Queue size:",
      changesQueueRef.current.size,
    )
    if (clusterer && changesQueueRef.current.size > 0) {
      flushChanges()
    }
  }, [clusterer, children])

  const flushChanges = () => {
    if (!clusterer) {
      log("Flush CANCELED: clusterer not ready.", "warning")
      return
    }
    log(`🚀 FLUSHING ${changesQueueRef.current.size} changes...`)

    const changes = new Map(changesQueueRef.current)
    changesQueueRef.current.clear()

    const toAdd: (kakao.maps.Marker | kakao.maps.CustomOverlay)[] = []
    const toRemove: (kakao.maps.Marker | kakao.maps.CustomOverlay)[] = []
    let newPortals = [...portals]

    changes.forEach((descriptor, id) => {
      const instance = kakaoInstancesRef.current.get(id)

      if (descriptor === null) {
        log(`-  (DELETE) id: ${id}`)
        if (instance) {
          toRemove.push(instance)
          kakaoInstancesRef.current.delete(id)
          markerDescriptorsRef.current.delete(id)
          const portalIndex = newPortals.findIndex((p) => p.id === id)
          if (portalIndex > -1) newPortals.splice(portalIndex, 1)
        }
      } else if (!instance) {
        log(`+  (CREATE) id: ${id}, type: ${descriptor.type}`)
        let newInstance: kakao.maps.Marker | kakao.maps.CustomOverlay | null =
          null
        const position = new kakao.maps.LatLng(
          descriptor.props.position.lat,
          descriptor.props.position.lng,
        )

        if (descriptor.type === "Marker") {
          newInstance = new kakao.maps.Marker({ ...descriptor.props, position })
        } else if (descriptor.type === "CustomOverlayMap") {
          const container = document.createElement("div")
          newInstance = new kakao.maps.CustomOverlay({
            ...descriptor.props,
            position,
            content: container,
          })
          if (descriptor.children) {
            newPortals.push({
              id,
              container,
              children: descriptor.children,
            })
          }
        }

        if (newInstance) {
          kakaoInstancesRef.current.set(id, newInstance)
          markerDescriptorsRef.current.set(id, descriptor)
          toAdd.push(newInstance)
        }
      } else {
        log(`~  (UPDATE) id: ${id}`)
        const newPosition = new kakao.maps.LatLng(
          descriptor.props.position.lat,
          descriptor.props.position.lng,
        )
        instance.setPosition(newPosition)
        instance.setZIndex(descriptor.props.zIndex || 0)

        if (
          instance instanceof kakao.maps.Marker &&
          "image" in descriptor.props
        ) {
          const imageProps = descriptor.props.image
          if (imageProps) {
            const markerImage = new kakao.maps.MarkerImage(
              imageProps.src,
              new kakao.maps.Size(
                imageProps.size.width,
                imageProps.size.height,
              ),
              imageProps.options,
            )
            instance.setImage(markerImage)
          }
        }
        markerDescriptorsRef.current.set(id, descriptor)
      }
    })

    log(
      `Batch operations: ${toAdd.length} to add, ${toRemove.length} to remove.`,
    )
    if (toRemove.length > 0) clusterer.removeMarkers(toRemove, true)
    if (toAdd.length > 0) clusterer.addMarkers(toAdd, true)

    setPortals(newPortals)
    clusterer.redraw()
    log("✅ FLUSH COMPLETE.", "success")
  }

  const registry = useRef<MarkerRegistry>({
    register(descriptor) {
      log(`Queued REGISTER for id: ${descriptor.id}`, "info", descriptor)
      changesQueueRef.current.set(descriptor.id, descriptor)
    },
    unregister(id) {
      log(`Queued UNREGISTER for id: ${id}`, "warning")
      changesQueueRef.current.set(id, null)
    },
    update(id, type, newProps, children) {
      const existing = markerDescriptorsRef.current.get(id)
      log(`Queued UPDATE for id: ${id}`, "info", { type, newProps, children })

      if (existing) {
        const newDescriptor: ChildDescriptor = {
          ...existing,
          props: newProps,
          children: children,
        }
        changesQueueRef.current.set(id, newDescriptor)
      } else {
        // 전달받은 type을 그대로 사용하여 더 이상 추측하지 않습니다.
        this.register({
          id,
          type: type,
          props: newProps,
          children: children,
        })
      }
    },
  }).current

  useImperativeHandle(ref, () => clusterer!, [clusterer])
  useKakaoEvent(clusterer, "clusterclick", onClusterclick)
  useKakaoEvent(clusterer, "clusterover", onClusterover)
  useKakaoEvent(clusterer, "clusterout", onClusterout)
  useKakaoEvent(clusterer, "clusterdblclick", onClusterdblclick)
  useKakaoEvent(clusterer, "clusterrightclick", onClusterrightclick)
  useKakaoEvent(clusterer, "clustered", onClustered)

  return (
    <MarkerClustererContext.Provider value={registry}>
      {children}
      {portals.map(({ id, container, children }) =>
        ReactDOM.createPortal(children, container, `cluster-portal-${id}`),
      )}
    </MarkerClustererContext.Provider>
  )
})
