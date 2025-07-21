import React, { useState, useMemo, useEffect } from "react"
import { Map, MapMarker, MarkerClusterer } from "react-kakao-maps-sdk"
import useKakaoLoader from "./useKakaoLoader"

// stations.json 데이터의 타입 정의
interface Station {
  statId: string
  statNm: string
  addr: string
  lat: number
  lng: number
  useTime: string
  busiNm: string
  busiCall: string
  parkingFree: boolean
  limitYn: boolean
  limitDetail: string
  note: string
  totalChargers: number
  chargers: {
    chgerId: string
    chgerType: string
    stat: string
    output: number
  }[]
}

// 거리를 포함한 충전소 데이터 타입 정의
interface StationWithDistance extends Station {
  distance: number
}

const ClustererFromLocalData: React.FC = () => {
  useKakaoLoader()

  const [map, setMap] = useState<kakao.maps.Map | null>(null)
  const [stations, setStations] = useState<Station[]>([])
  const [visibleStations, setVisibleStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)

  // 컴포넌트 마운트 시 stations.json 데이터를 fetch
  useEffect(() => {
    fetch("/stations.json") // public 폴더의 파일에 접근
      .then((response) => response.json())
      .then((data) => {
        setStations(data)
        setLoading(false)
      })
      .catch((error) => {
        console.error("Error fetching stations data:", error)
        setLoading(false)
      })
  }, [])

  // 현재 지도 중심과 모든 충전소 사이의 거리를 계산
  const stationDistances = useMemo<StationWithDistance[]>(() => {
    if (!map || stations.length === 0) return []

    const center = map.getCenter()
    return stations
      .map((station) => {
        const markerPosition = new window.kakao.maps.LatLng(
          station.lat,
          station.lng,
        )
        const polyline = new window.kakao.maps.Polyline({
          path: [center, markerPosition],
        })
        return {
          ...station,
          distance: polyline.getLength(),
        }
      })
      .sort((a, b) => a.distance - b.distance)
  }, [map, stations])

  // 100개의 충전소를 추가하는 함수
  const addStations = () => {
    if (!map) return
    const newStations = stationDistances
      .filter(
        (station) =>
          !visibleStations.find((vs) => vs.statId === station.statId),
      )
      .slice(0, 10)
    setVisibleStations((prev) => [...prev, ...newStations])
  }

  // 100개의 충전소를 제거하는 함수
  const removeStations = () => {
    setVisibleStations((prev) => prev.slice(0, Math.max(0, prev.length - 10)))
  }

  // 지도가 로드되고 데이터 fetch가 완료되면 초기 데이터를 설정
  useEffect(() => {
    if (
      !loading &&
      map &&
      stationDistances.length > 0 &&
      visibleStations.length === 0
    ) {
      setVisibleStations(stationDistances.slice(0, 10))
    }
  }, [loading, map, stationDistances, visibleStations.length])

  if (loading) {
    return <div>충전소 데이터를 불러오는 중입니다...</div>
  }

  return (
    <>
      <Map
        center={{
          lat: 37.566826,
          lng: 126.9786567,
        }}
        style={{
          width: "100%",
          height: "450px",
        }}
        level={7}
        onCreate={setMap}
      >
        <MarkerClusterer averageCenter={true} minLevel={10}>
          {visibleStations.map((station) => (
            <MapMarker
              key={station.statId} // 고유 key로 statId 사용
              position={{
                lat: station.lat,
                lng: station.lng,
              }}
              //title={station.statNm}  에러 발생, mount > unmount > mount 과정에서 마커가 null 일 수 있음
            />
          ))}
        </MarkerClusterer>
      </Map>
      <div style={{ marginTop: "1rem" }}>
        <button onClick={addStations} style={{ marginRight: "0.5rem" }}>
          주변 충전소 100개 추가
        </button>
        <button onClick={removeStations}>충전소 100개 제거</button>
        <p>현재 표시된 충전소 개수: {visibleStations.length}</p>
      </div>
    </>
  )
}

export default ClustererFromLocalData
