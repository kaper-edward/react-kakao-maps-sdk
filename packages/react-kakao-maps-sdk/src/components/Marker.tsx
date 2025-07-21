import React, {
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react"
import { useMap } from "../hooks/useMap"
import { useKakaoEvent } from "../hooks/useKakaoEvent"
import { useKakaoMapsSetEffect } from "../hooks/useKakaoMapsSetEffect"
import { MarkerClustererContext } from "./MarkerClusterer"
import { InfoWindow } from "./InfoWindow"

// --- 타입 정의 ---

export interface MarkerProps {
  map?: kakao.maps.Map | kakao.maps.Roadview
  position: { lat: number; lng: number }
  image?: {
    src: string
    size: { width: number; height: number }
    options?: kakao.maps.MarkerOptions["image"] extends kakao.maps.MarkerImage
      ? kakao.maps.MarkerImage["__getOptions"]
      : never
  }
  title?: string
  draggable?: boolean
  clickable?: boolean
  zIndex?: number
  opacity?: number
  altitude?: number
  range?: number
  onCreate?: (marker: kakao.maps.Marker) => void
  onClick?: (marker: kakao.maps.Marker) => void
  // ... 기타 이벤트 핸들러 ...
}

// --- 컴포넌트 구현 ---

let markerCounter = 0

export const Marker = React.forwardRef<
  kakao.maps.Marker,
  React.PropsWithChildren<MarkerProps>
>(function Marker({ children, ...props }, ref) {
  const map = useMap("Marker")
  const registry = useContext(MarkerClustererContext)

  // 고유 ID 생성
  const id = useRef(markerCounter++).current
  const isMounted = useRef(false)

  // 클러스터러 하위에 있을 경우, 설명서(Descriptor) 등록/수정/해제 로직
  useEffect(() => {
    if (!registry) return

    const descriptor = { id, type: "Marker" as const, props, children }

    if (!isMounted.current) {
      registry.register(descriptor)
      isMounted.current = true
    } else {
      // update 호출 시 자신의 타입 "Marker"를 전달
      registry.update(id, "Marker", props, children)
    }

    return () => {
      registry.unregister(id)
    }
  }, [registry, id, props, children])

  // 클러스터러 하위에 있을 경우, 렌더링은 부모에게 위임하므로 null 반환
  if (registry) {
    return null
  }

  // --- 이하 독립적으로 사용될 때의 기존 로직 (Fallback) ---

  const markerImage = useMemo(() => {
    if (!props.image) return
    return new kakao.maps.MarkerImage(
      props.image.src,
      new kakao.maps.Size(props.image.size.width, props.image.size.height),
      props.image.options,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(props.image)])

  const marker = useMemo(() => {
    return new kakao.maps.Marker({
      ...props,
      position: new kakao.maps.LatLng(props.position.lat, props.position.lng),
      image: markerImage,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => marker, [marker])

  useLayoutEffect(() => {
    marker.setMap(map)
    return () => marker.setMap(null)
  }, [map, marker])

  useLayoutEffect(() => {
    if (props.onCreate) props.onCreate(marker)
  }, [marker, props.onCreate])

  useKakaoMapsSetEffect(marker, "setPosition", position)
  useKakaoMapsSetEffect(marker, "setImage", markerImage!)
  useKakaoMapsSetEffect(marker, "setAltitude", altitude!)
  useKakaoMapsSetEffect(marker, "setClickable", clickable!)
  useKakaoMapsSetEffect(marker, "setDraggable", draggable!)
  useKakaoMapsSetEffect(marker, "setOpacity", opacity!)
  useKakaoMapsSetEffect(marker, "setRange", range!)
  useKakaoMapsSetEffect(marker, "setTitle", title!)
  useKakaoMapsSetEffect(marker, "setZIndex", zIndex!)

  useKakaoEvent(marker, "click", onClick)
  useKakaoEvent(marker, "dragstart", onDragStart)
  useKakaoEvent(marker, "dragend", onDragEnd)
  useKakaoEvent(marker, "mouseout", onMouseOut)
  useKakaoEvent(marker, "mouseover", onMouseOver)

  if (children) {
    return (
      <InfoWindow map={map} marker={marker} position={props.position}>
        {children}
      </InfoWindow>
    )
  }

  return null
})
