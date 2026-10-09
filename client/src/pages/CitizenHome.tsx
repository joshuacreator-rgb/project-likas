import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  CloudRain,
  ImagePlus,
  LogOut,
  MapPin,
  PhoneCall,
  Search,
  ShieldCheck,
  Siren,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  classifyAttachments,
  hasOutstanding,
  MAX_ATTACHMENTS,
  uploadPending,
  type Attachment,
  type AttachmentRejection,
  type EvidenceSend,
} from "@/lib/reportEvidence";
import RoleOnboarding from "@/components/RoleOnboarding";
import { VideoFacade } from "@/components/VideoFacade";
import { DisasterNewsFeed } from "@/components/DisasterNewsFeed";
import { DisasterVideoFeed } from "@/components/DisasterVideoFeed";
import { getStaticSession } from "@/lib/staticAuth";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import {
  addOfflineReport,
  citizenCopy,
  distanceKm,
  getDirectionsUrl,
  getSmsFallbackUrl,
  parseOfflineReports,
  projectOfflineMapPoint,
  serializeOfflineReport,
  sortCentersForCitizens,
  type CitizenEmergencyNotification,
  type CitizenLanguage,
  type RealtimeStreamPayload,
} from "../../../shared/citizen";
import {
  HARDCODED_NEWS_ARTICLES,
  HARDCODED_NEWS_VIDEOS,
  NEWS_REFRESH_MS,
  toNewsFeedStateWithFallback,
  type NewsArticle,
  type NewsFeedState,
  type NewsVideo,
} from "../../../shared/news";
import {
  adviceBodyText,
  adviceCategoriesInUse,
  adviceCategoryLabel,
  adviceHeadline,
  adviceStepText,
  adviceSummaryText,
  buildAdviceSpeech,
  normalizeAdviceSteps,
  sortAdviceForDisplay,
  type AdviceRecord,
  type AdviceStepRecord,
} from "../../../shared/advice";
import { builtinAdvice } from "../../../shared/adviceContent";

/** Published guidance plus its steps, as cached and as returned by the API. */
type CitizenAdviceRow = AdviceRecord & { steps: AdviceStepRecord[]; youtubeId?: string | null };

type CitizenCenterRow = {
  name: string;
  address: string;
  nameFilipino?: string | null;
  addressFilipino?: string | null;
  currentOccupancy: number;
  maximumCapacity: number;
  status: string;
  latitude: string | number;
  longitude: string | number;
};
function CitizenLocationPickerEvents({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: event => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}
function CitizenLocationPicker({ latitude, longitude, onPick }: { latitude: number; longitude: number; onPick: (latitude: number, longitude: number) => void }) {
  return <div className="pateros-location-picker"><div className="pateros-picker-label"><MapPin size={14} /> Pin the incident location inside Pateros</div><MapContainer center={[latitude, longitude]} zoom={14} minZoom={13} maxZoom={18} maxBounds={[[14.53, 121.05], [14.56, 121.09]]} maxBoundsViscosity={1} scrollWheelZoom className="pateros-picker-map"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><CitizenLocationPickerEvents onPick={onPick} /><CircleMarker center={[latitude, longitude]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#c85f5a", fillOpacity: 1 }} /></MapContainer><small>Selected coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}</small></div>;
}
type CitizenCenterMapProps = {
  centers: Array<{
    name: string;
    displayName?: string;
    displayAddress?: string;
    latitude: string | number;
    longitude: string | number;
  }>;
  origin: { lat: number; lng: number } | null;
  directionsLabel: string;
};
function CitizenCenterMap({ centers, origin, directionsLabel }: CitizenCenterMapProps) {
  const positions = centers
    .map(center => ({ lat: Number(center.latitude), lng: Number(center.longitude) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  const southWest = {
    lat: positions.length > 1 ? Math.min(...positions.map(point => point.lat)) : 14.53,
    lng: positions.length > 1 ? Math.min(...positions.map(point => point.lng)) : 121.05,
  };
  const northEast = {
    lat: positions.length > 1 ? Math.max(...positions.map(point => point.lat)) : 14.56,
    lng: positions.length > 1 ? Math.max(...positions.map(point => point.lng)) : 121.09,
  };
  const fallbackCenter = positions[0] ?? { lat: 14.544, lng: 121.071 };
  return (
    <div className="citizen-map-wrap">
      <MapContainer
        className="citizen-map"
        center={fallbackCenter}
        zoom={positions.length === 1 ? 15 : 14}
        bounds={[[southWest.lat, southWest.lng], [northEast.lat, northEast.lng]]}
        scrollWheelZoom
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {centers.map((center, index) => {
          const lat = Number(center.latitude);
          const lng = Number(center.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          const label = String(center.displayName || center.name);
          const href = getDirectionsUrl({ lat, lng }, origin || undefined);
          return (
            <CircleMarker
              key={`${label}-${index}`}
              center={[lat, lng]}
              radius={10}
              pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#147d70", fillOpacity: 1 }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {label}
              </Tooltip>
              <Popup>
                <strong>{label}</strong>
                {center.displayAddress ? (
                  <span className="citizen-map-popup-address">{String(center.displayAddress)}</span>
                ) : null}
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {directionsLabel}
                </a>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
const fallbackCenters: CitizenCenterRow[] = [
  {
    name: "Rizal Tolentino Center",
    address: "P. Herrera St.",
    currentOccupancy: 82,
    maximumCapacity: 120,
    status: "OPEN",
    latitude: 14.546,
    longitude: 121.074,
  },
  {
    name: "M. L. Quezon Center",
    address: "B. Morcilla St.",
    currentOccupancy: 48,
    maximumCapacity: 80,
    status: "OPEN",
    latitude: 14.548,
    longitude: 121.066,
  },
  {
    name: "Sta. Ana Gymnasium",
    address: "M. Almeda St.",
    currentOccupancy: 96,
    maximumCapacity: 150,
    status: "OPEN",
    latitude: 14.537,
    longitude: 121.075,
  },
];
const fallbackAlerts = [
  {
    title: "Flood watch in Sta. Ana",
    message:
      "Avoid low-lying roads near the creek. Response teams are monitoring water levels.",
    priority: "CRITICAL",
  },
  {
    title: "Community help line",
    message:
      "Call 911 for immediate danger or use Report an emergency to send details to responders.",
    priority: "HIGH",
  },
];
const fallbackAlertsFil = [
  {
    title: "Bantay-baha sa Sta. Ana",
    message:
      "Iwasan ang mabababang kalsada malapit sa sapa. Binabantayan ng mga response team ang lebel ng tubig.",
    priority: "CRITICAL",
  },
  {
    title: "Linya ng tulong",
    message:
      "Tumawag sa 911 kung may agarang panganib o gamitin ang Mag-ulat ng emergency.",
    priority: "HIGH",
  },
];

function readStaticCenterRecords(): CitizenCenterRow[] {
  try {
    const raw = window.localStorage.getItem("likas-static-centers");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(center => center?.name).map(center => ({
          ...center,
          latitude: center.latitude ?? 14.544,
          longitude: center.longitude ?? 121.071,
        }))
      : [];
  } catch {
    return [];
  }
}

/**
 * Guidance stays readable when the network drops, which is exactly when it
 * matters. Mirrors the `likas-cached-centers` pattern.
 */
function readCachedAdvice(): CitizenAdviceRow[] {
  try {
    const raw = window.localStorage.getItem("likas-cached-advice");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item?.id && item?.title) : [];
  } catch {
    return [];
  }
}

function speakText(text: string, lang = "en-PH") {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
  return true;
}

function formatLiveEmergencyTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CitizenHome() {
  const { user, logout } = useAuth();
  const { data: centers } = trpc.operations.centers.useQuery();
  const [staticCenters] = useState<CitizenCenterRow[]>(readStaticCenterRecords);
  const { data: alerts } = trpc.operations.alerts.useQuery(undefined, {
    enabled: Boolean(user),
  });
  // Safety guidance is intentionally ungated: no session is required to read it.
  const { data: publishedAdvice } = trpc.advice.list.useQuery();
  // Disaster news + videos (§24) arrive through the server-side proxy. The
  // staleTime mirrors the proxy's own cache, so a page refetch never happens
  // more than once per 5 minutes - react-query keeps the timestamp bookkeeping.
  const newsQuery = trpc.news.articles.useQuery(undefined, {
    staleTime: NEWS_REFRESH_MS,
    retry: 0,
  });
  const videosQuery = trpc.news.videos.useQuery(undefined, {
    staleTime: NEWS_REFRESH_MS,
    retry: 0,
  });
  const [adviceFilter, setAdviceFilter] = useState("ALL");
  const [openAdviceId, setOpenAdviceId] = useState<number | null>(null);
  const [cachedAdvice, setCachedAdvice] = useState<CitizenAdviceRow[]>(readCachedAdvice);
  const { data: smsConfig } = trpc.operations.emergencySms.useQuery();
  const createReportMutation = trpc.operations.createRiskReport.useMutation();
  const evidenceMutation = trpc.operations.uploadEvidence.useMutation();
  const [reportOpen, setReportOpen] = useState(false);
  const [centerSearch, setCenterSearch] = useState("");
  const [reportText, setReportText] = useState("");
  const [location, setLocation] = useState("");
  const [reportLatitude, setReportLatitude] = useState(14.544);
  const [reportLongitude, setReportLongitude] = useState(121.071);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [largeText, setLargeText] = useState(
    () => window.localStorage.getItem("likas-large-text") === "true"
  );
  const [language, setLanguage] = useState<CitizenLanguage>(() =>
    window.localStorage.getItem("likas-language") === "en" ? "en" : "fil"
  );
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [submitMode, setSubmitMode] = useState<"sent" | "queued">("sent");
  const [submitError, setSubmitError] = useState("");

  /**
   * US-5 photo attachments.
   *
   * `attachmentsRef` mirrors `attachments` because the upload path reads it
   * from callbacks that outlive the render they were created in — an
   * `onSuccess`, an `online` listener, and the offline queue flush all run
   * later, against whatever state was current then. Reading state directly in
   * any of those is how a retry ends up uploading a stale list. The ref is the
   * source of truth for sending; the state exists so React redraws.
   */
  const attachmentsRef = useRef<Attachment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<AttachmentRejection | "">("");
  /**
   * Non-null once a report exists and at least one photo still owes. It is
   * both the id the retry needs and the flag that decides whether the resident
   * is shown "Report sent — photo pending".
   */
  const [pendingReportId, setPendingReportId] = useState<number | null>(null);
  /** The report was queued offline and is holding photos for the flush. */
  const [queuedWithPhotos, setQueuedWithPhotos] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [cachedCenters, setCachedCenters] = useState<CitizenCenterRow[]>(() => {
    try {
      const raw = window.localStorage.getItem("likas-cached-centers");
      return raw ? (JSON.parse(raw) as CitizenCenterRow[]) : [];
    } catch {
      return [];
    }
  });
  const [liveEmergencyNotifications, setLiveEmergencyNotifications] = useState<
    CitizenEmergencyNotification[]
  >([]);
  const [dismissedLiveEmergencyId, setDismissedLiveEmergencyId] = useState<
    number | null
  >(null);
  const seenLiveEmergencyIdsRef = useRef(new Set<number>());
  const latestLiveEmergency = liveEmergencyNotifications[0];
  const t = citizenCopy[language];
  const speechLanguage = language === "fil" ? "fil-PH" : "en-PH";
  const offlineSyncingRef = useRef(false);
  const displayCenters = useMemo(() => {
    const rows: CitizenCenterRow[] = centers?.length
      ? centers.map(center => ({
          ...center,
          nameFilipino: center.nameFilipino ?? null,
          addressFilipino: center.addressFilipino ?? null,
        }))
      : staticCenters.length
        ? staticCenters
        : cachedCenters.length
        ? cachedCenters
        : fallbackCenters;
    const translated = rows.map(center => ({
      ...center,
      displayName:
        language === "fil" ? center.nameFilipino || center.name : center.name,
      displayAddress:
        language === "fil"
          ? center.addressFilipino || center.address
          : center.address,
    }));
    const withDistance = userLocation
      ? translated.map(center => ({
          ...center,
          distance: distanceKm(userLocation, {
            lat: Number(center.latitude),
            lng: Number(center.longitude),
          }),
        }))
      : translated;
    // Open centers with free slots first, then nearest, then by name — the
    // vacancy a citizen can actually use is what they should see first.
    return sortCentersForCitizens(withDistance);
  }, [centers, staticCenters, cachedCenters, language, userLocation]);
  const visibleCenters = useMemo(() => {
    const query = centerSearch.trim().toLowerCase();
    if (!query) return displayCenters;
    return displayCenters.filter(center =>
      `${center.displayName} ${center.displayAddress} ${center.status}`.toLowerCase().includes(query)
    );
  }, [centerSearch, displayCenters]);
  const usingCachedCenters = !centers?.length && cachedCenters.length > 0;
  const adviceRows = useMemo<CitizenAdviceRow[]>(
    () =>
      sortAdviceForDisplay(
        (publishedAdvice?.length
          ? publishedAdvice
          : cachedAdvice.length
            ? cachedAdvice
            : builtinAdvice) as CitizenAdviceRow[],
      ),
    [publishedAdvice, cachedAdvice],
  );
  const usingCachedAdvice = !publishedAdvice?.length && cachedAdvice.length > 0;
  /** §13: built-in tips are the guarantee that advice always shows; published content wins over them. */
  const usingBuiltinAdvice = !publishedAdvice?.length && cachedAdvice.length === 0;
  const adviceFilters = useMemo(() => adviceCategoriesInUse(adviceRows), [adviceRows]);
  const visibleAdvice = useMemo(
    () =>
      adviceFilter === "ALL"
        ? adviceRows
        : adviceRows.filter(row => row.category === adviceFilter),
    [adviceFilter, adviceRows],
  );
  const displayAlerts = useMemo(() => {
    const rows = alerts?.length
      ? alerts.slice(0, 3)
      : language === "fil"
        ? fallbackAlertsFil
        : fallbackAlerts;
    return rows.map(alert => ({
      ...alert,
      title: String(
        language === "fil"
          ? "titleFilipino" in alert
            ? alert.titleFilipino || alert.title
            : alert.title
          : alert.title
      ),
      message: String(
        language === "fil"
          ? "messageFilipino" in alert
            ? alert.messageFilipino || alert.message
            : alert.message
          : alert.message
      ),
    }));
  }, [alerts, language]);
  const smsUrl = getSmsFallbackUrl(
    smsConfig?.officialNumber || "09171234567",
    `${language === "fil" ? "EMERGENCY / EMERGENCY REPORT" : "EMERGENCY REPORT"}: ${reportText || "Need help"} — ${location || "Location unavailable"}`
  );

  useEffect(() => {
    if (centers?.length) {
      window.localStorage.setItem(
        "likas-cached-centers",
        JSON.stringify(centers)
      );
      setCachedCenters(centers);
    }
  }, [centers]);
  useEffect(() => {
    if (publishedAdvice?.length) {
      window.localStorage.setItem(
        "likas-cached-advice",
        JSON.stringify(publishedAdvice),
      );
      setCachedAdvice(publishedAdvice as CitizenAdviceRow[]);
    }
  }, [publishedAdvice]);
  useEffect(() => {
    const isStaticSession = Boolean(
      getStaticSession() || sessionStorage.getItem("likas-static-demo-role")
    );
    if (
      !user ||
      isStaticSession ||
      (user.role !== "citizen" && user.role !== "user") ||
      typeof EventSource === "undefined"
    )
      return;

    const source = new EventSource("/api/stream");
    source.onmessage = event => {
      let payload: RealtimeStreamPayload;
      try {
        payload = JSON.parse(event.data) as RealtimeStreamPayload;
      } catch {
        return;
      }
      if (
        payload.type !== "incident" ||
        !Number.isInteger(payload.data.id) ||
        seenLiveEmergencyIdsRef.current.has(payload.data.id)
      )
        return;

      seenLiveEmergencyIdsRef.current.add(payload.data.id);
      setLiveEmergencyNotifications(previous => [
        payload.data,
        ...previous.filter(item => item.id !== payload.data.id),
      ].slice(0, 5));

      const title = language === "fil"
        ? "May bagong emergency sa lugar"
        : "Emergency reported nearby";
      const description = `${payload.data.reportType} · ${payload.data.location}`;
      toast(title, {
        description,
        duration: 12000,
      });
    };
    return () => source.close();
  }, [user, language]);
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!navigator.geolocation) setLocationMessage(t.locationDenied);
    else
      navigator.geolocation.getCurrentPosition(
        position => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setLocationMessage(t.located);
        },
        () => setLocationMessage(t.locationDenied),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [language, t.located, t.locationDenied]);
  useEffect(() => {
    const syncQueued = async () => {
      if (!user || offlineSyncingRef.current) return;
      const raw =
        window.localStorage.getItem("likas-offline-reports") ||
        window.localStorage.getItem("likas-offline-report");
      if (!raw) return;
      offlineSyncingRef.current = true;
      try {
        const remaining = parseOfflineReports(raw);
        let photosAttached = false;
        while (remaining.length) {
          const queued = remaining[0];
          const created = await createReportMutation.mutateAsync({
            reportCode: `CIT-${Date.now()}-${remaining.length}`,
            reportType: "Citizen emergency",
            description: queued.reportText,
            location: queued.location,
            latitude: queued.latitude,
            longitude: queued.longitude,
            priority: "HIGH",
          });
          remaining.shift();
          /**
           * US-5 AC 6, the other half of it. A report queued while offline only
           * really exists now, and an upload hangs off a report id — so this is
           * the only moment photos picked before the connection dropped can be
           * attached to it.
           *
           * Guarded by a flag local to this run rather than by `pendingReportId`
           * because this effect closes over `[user]` and would otherwise read a
           * stale value. Once a run has handed its photos to a report they are
           * either sent or belong to that report, so a later report in the same
           * queue must not inherit them.
           */
          if (
            !photosAttached &&
            created?.id != null &&
            hasOutstanding(attachmentsRef.current)
          ) {
            photosAttached = true;
            setQueuedWithPhotos(false);
            setPendingReportId(created.id);
            await runPhotoUploads(created.id);
          }
          if (remaining.length)
            window.localStorage.setItem("likas-offline-reports", JSON.stringify(remaining));
          else {
            window.localStorage.removeItem("likas-offline-reports");
            window.localStorage.removeItem("likas-offline-report");
          }
        }
      } catch {
        // Keep the current queue so the next online event can retry it.
      } finally {
        offlineSyncingRef.current = false;
      }
    };
    window.addEventListener("online", syncQueued);
    if (navigator.onLine) void syncQueued();
    return () => window.removeEventListener("online", syncQueued);
  }, [user]);

  /**
   * US-5 AC 6: the photo retries itself when the connection comes back.
   *
   * Separate from the queue flush above because these are different failures.
   * The queue holds reports that were never created; this holds a report that
   * exists and photographs that did not arrive. Reading `attachmentsRef` and
   * `pendingReportId` from the closure is deliberate — a listener installed
   * once and torn down on change sees the values as they were when it was
   * installed, which for a state pair updated together is exactly right.
   */
  useEffect(() => {
    if (pendingReportId == null) return;
    const retryPhotos = () => {
      if (!hasOutstanding(attachmentsRef.current)) return;
      void runPhotoUploads(pendingReportId);
    };
    window.addEventListener("online", retryPhotos);
    return () => window.removeEventListener("online", retryPhotos);
    // `runPhotoUploads` is redefined every render but only touches refs and
    // setters, so re-subscribing on `pendingReportId` alone keeps this honest
    // without churning the listener on every keystroke in the report box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReportId]);
  function showDirections(center: {
    latitude: string | number;
    longitude: string | number;
  }) {
    const destination = {
      lat: Number(center.latitude),
      lng: Number(center.longitude),
    };
    window.open(
      getDirectionsUrl(destination, userLocation || undefined),
      "_blank",
      "noopener,noreferrer"
    );
  }
  function readPage() {
    const noAlert =
      language === "fil" ? "Walang agarang alerto" : "No urgent alert";
    const ready =
      language === "fil" ? "Handa ang mga center." : "All centers are ready.";
    speakText(
      `${t.welcome} ${displayAlerts[0]?.title || noAlert}. ${displayAlerts[0]?.message || ready} ${displayCenters.length} ${t.nearby}. ${t.report}.`,
      speechLanguage
    );
  }
  async function handleLogout() {
    await logout();
    window.location.href = "/login";
  }
  /** Replaces the attachment list in both the ref and React's view of it. */
  function commitAttachments(next: Attachment[]) {
    attachmentsRef.current = next;
    setAttachments(next);
  }

  /** Maps a rejection code onto the resident's language. */
  function attachmentRejectionCopy(code: AttachmentRejection): string {
    if (code === "TOO_LARGE") return t.photoTooLarge;
    if (code === "TOO_MANY") return t.tooManyPhotos;
    return t.photoUnsupported;
  }

  /**
   * Adds whatever the resident just picked, keeping the order they picked it
   * in and reporting the first refusal as a code for the copy to translate.
   */
  function addChosenFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const { accepted, rejected } = classifyAttachments(
      Array.from(files),
      attachmentsRef.current,
    );
    if (accepted.length > 0) {
      commitAttachments([...attachmentsRef.current, ...accepted]);
      setAttachmentError("");
    }
    if (rejected.length > 0) setAttachmentError(rejected[0]);
  }

  function removeAttachment(id: string) {
    setAttachmentError("");
    commitAttachments(attachmentsRef.current.filter(item => item.id !== id));
  }

  /**
   * The concrete `EvidenceSend`. One line, and the only place in the client
   * that knows photos travel as base64 inside a tRPC call — see
   * `client/src/lib/reportEvidence.ts`.
   */
  const sendEvidence: EvidenceSend = ({ reportId, fileName, dataBase64 }) =>
    evidenceMutation.mutateAsync({ reportId, fileName, dataBase64 });

  /**
   * Sends whatever is outstanding for a report and updates the pending flag
   * from the result.
   *
   * Files already `sent` are skipped by `uploadPending`, so a retry after a
   * dropped connection resumes where it stopped instead of uploading the same
   * photograph twice into a resident's incident record.
   */
  async function runPhotoUploads(reportId: number) {
    if (!hasOutstanding(attachmentsRef.current)) {
      setPendingReportId(null);
      return;
    }
    commitAttachments(
      attachmentsRef.current.map(item =>
        item.status === "sent" ? item : { ...item, status: "uploading" as const },
      ),
    );
    const next = await uploadPending(reportId, attachmentsRef.current, sendEvidence);
    commitAttachments(next);
    const stillWaiting = hasOutstanding(next);
    setPendingReportId(stillWaiting ? reportId : null);
    if (!stillWaiting) setQueuedWithPhotos(false);
  }

  function submitReport() {
    if (
      reportText.trim().length < 5 ||
      location.trim().length < 2 ||
      createReportMutation.isPending
    )
      return;
    if (!isOnline) {
      window.localStorage.setItem(
        "likas-offline-reports",
        addOfflineReport(window.localStorage.getItem("likas-offline-reports"), {
          reportText: reportText.trim(),
          location: location.trim(),
          latitude: reportLatitude,
          longitude: reportLongitude,
          createdAt: Date.now(),
        })
      );
      setSubmitMode("queued");
      setSubmitted(true);
      setQueuedWithPhotos(hasOutstanding(attachmentsRef.current));
      speakText(t.queued, speechLanguage);
      return;
    }
    if (getStaticSession() || sessionStorage.getItem("likas-static-demo-role")) {
      const reports = JSON.parse(window.localStorage.getItem("likas-static-reports") || "[]");
      reports.unshift({
        id: -Date.now(),
        reportCode: `CIT-${Date.now()}`,
        reportType: "Citizen emergency",
        description: reportText.trim(),
        location: location.trim(),
        latitude: reportLatitude,
        longitude: reportLongitude,
        priority: "HIGH",
        status: "PENDING",
      });
      window.localStorage.setItem("likas-static-reports", JSON.stringify(reports));
      window.dispatchEvent(new Event("likas-static-reports-changed"));
      setSubmitMode("sent");
      setSubmitted(true);
      speakText(t.sent, speechLanguage);
      return;
    }
    createReportMutation.mutate(
      {
        reportCode: `CIT-${Date.now()}`,
        reportType: "Citizen emergency",
        description: reportText.trim(),
        location: location.trim(),
        latitude: reportLatitude,
        longitude: reportLongitude,
        priority: "HIGH",
      },
      {
        onSuccess: created => {
          setSubmitMode("sent");
          setSubmitted(true);
          speakText(t.sent, speechLanguage);
          /**
           * US-5 AC 6. The report exists now, so the photos have somewhere to
           * go — and if any of them fail the resident is shown a pending state
           * rather than a false success, because the alternative is a report
           * that looks evidenced and is not.
           */
          if (created?.id != null && attachmentsRef.current.length > 0) {
            setPendingReportId(created.id);
            void runPhotoUploads(created.id);
          }
        },
        onError: (error) => {
          // Network/offline error — queue for retry
          if (!navigator.onLine || error.message?.toLowerCase().includes("fetch")) {
            window.localStorage.setItem(
              "likas-offline-reports",
              addOfflineReport(
                window.localStorage.getItem("likas-offline-reports"),
                {
                  reportText: reportText.trim(),
                  location: location.trim(),
                  latitude: reportLatitude,
                  longitude: reportLongitude,
                  createdAt: Date.now(),
                }
              )
            );
            setSubmitMode("queued");
            setSubmitted(true);
            setQueuedWithPhotos(hasOutstanding(attachmentsRef.current));
            speakText(t.queued, speechLanguage);
          } else {
            /**
             * A Zod rejection arrives as a JSON-serialised issues array in
             * `error.message`. That payload is for developers, not for a
             * resident in an emergency — fall back to the friendly message
             * whenever the server did not send a human sentence.
             */
            const raw = (error.message || "").trim();
            const looksLikePayload =
              raw.startsWith("[") || raw.startsWith("{");
            const msg =
              !raw || looksLikePayload
                ? language === "fil"
                  ? "Hindi maipadala ang ulat. Subukan muli o gamitin ang SMS."
                  : "Report could not be sent. Please try again or use SMS."
                : raw;
            setSubmitError(msg);
          }
        },
      }
    );
  }

  const newsState: NewsFeedState<NewsArticle> = toNewsFeedStateWithFallback(
    newsQuery.data,
    newsQuery.isLoading,
    HARDCODED_NEWS_ARTICLES
  );
  const videoState: NewsFeedState<NewsVideo> = toNewsFeedStateWithFallback(
    videosQuery.data,
    videosQuery.isLoading,
    HARDCODED_NEWS_VIDEOS
  );

  return (
    <div className={`citizen-app ${largeText ? "large-text" : ""}`}>
      <RoleOnboarding role={user?.role || "citizen"} />
      <header className="citizen-header">
        <div className="citizen-brand">
          <div className="brand-mark">
            <ShieldCheck size={22} />
          </div>
          <div>
            <strong>PROJECT LIKAS</strong>
            <span>{t.subtitle}</span>
          </div>
        </div>
        <div className="citizen-header-actions">
          <div className="language-toggle" role="group" aria-label="Language">
            <button
              className={language === "en" ? "selected" : ""}
              onClick={() => {
                setLanguage("en");
                window.localStorage.setItem("likas-language", "en");
              }}
            >
              English
            </button>
            <button
              className={language === "fil" ? "selected" : ""}
              onClick={() => {
                setLanguage("fil");
                window.localStorage.setItem("likas-language", "fil");
              }}
            >
              Filipino
            </button>
          </div>
          <Button variant="outline" className="speak-button" onClick={readPage}>
            <Volume2 size={18} /> {t.readPage}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setLargeText(value => {
                const next = !value;
                window.localStorage.setItem("likas-large-text", String(next));
                return next;
              })
            }
            aria-pressed={largeText}
          >
            {largeText ? t.standardText : t.largerText}
          </Button>
          {user ? (
            <>
              <span className="citizen-role">
                {user.name || "Resident"} ·{" "}
                {language === "fil" ? "Mamamayan" : "Citizen"}
              </span>
              <Button variant="outline" className="logout-button" onClick={handleLogout}>
                <LogOut size={16} /> {language === "fil" ? "Lumabas" : "Log out"}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                window.location.href = "/login";
              }}
            >
              {t.signIn}
            </Button>
          )}
        </div>
      </header>
      {latestLiveEmergency && latestLiveEmergency.id !== dismissedLiveEmergencyId && (
        <section className="citizen-live-emergency" role="alert" aria-live="assertive">
          <Siren size={24} aria-hidden="true" />
          <div className="citizen-live-emergency-copy">
            <span className="eyebrow">{language === "fil" ? "AGARANG BALITA" : "LIVE EMERGENCY"}</span>
            <strong>{language === "fil" ? "May bagong emergency sa lugar" : "Emergency reported nearby"}</strong>
            <p>{latestLiveEmergency.reportType} · {latestLiveEmergency.location}</p>
            <small>
              {language === "fil" ? "Iwasan ang lugar at sundin ang opisyal na abiso." : "Avoid the area and follow official guidance."}
              {latestLiveEmergency.createdAt && ` · ${formatLiveEmergencyTime(latestLiveEmergency.createdAt)}`}
            </small>
          </div>
          <button
            type="button"
            className="citizen-live-emergency-dismiss"
            onClick={() => setDismissedLiveEmergencyId(latestLiveEmergency.id)}
            aria-label={language === "fil" ? "Isara ang abiso" : "Dismiss notification"}
          >
            <X size={18} />
          </button>
        </section>
      )}
      <main className="citizen-main">
        <section className="citizen-welcome">
          <div>
            <span className="eyebrow">
              <span className="live-dot" /> {t.safety}
            </span>
            <h1>Hi, {user?.name?.trim() || "Resident"}</h1>
            <p>{t.intro}</p>
            <small
              className={`citizen-connectivity ${isOnline ? "online" : "offline"}`}
            >
              {isOnline ? locationMessage || t.locating : t.offline}
            </small>
          </div>
          <div className="citizen-weather">
            <CloudRain size={24} />
            <span>
              <strong>29°</strong>
              <small>
                {language === "fil"
                  ? "Maulap na may ulan · Pateros"
                  : "Partly cloudy · Pateros"}
              </small>
            </span>
          </div>
        </section>
        <section className="citizen-actions">
          <button
            className="citizen-emergency"
            onClick={() => {
              setReportOpen(true);
            }}
          >
            <span className="emergency-icon">
              <Siren size={28} />
            </span>
            <span>
              <strong>{t.report}</strong>
              <small>{t.reportHelp}</small>
            </span>
            <ChevronRight size={24} />
          </button>
          <a className="help-call" href="tel:911">
            <PhoneCall size={20} />
            <span>
              <strong>{t.immediate}</strong>
              <small>{t.call911}</small>
            </span>
          </a>
        </section>
        <section className="citizen-section-head">
          <div>
            <span className="eyebrow">{t.safePlaces}</span>
            <h2>{t.nearby}</h2>
            <p>{t.nearbyHelp}</p>
          </div>
          <label className="citizen-center-search">
            <Search size={16} />
            <Input value={centerSearch} onChange={event => setCenterSearch(event.target.value)} placeholder={language === "fil" ? "Maghanap ng evacuation center" : "Search evacuation centers"} aria-label={language === "fil" ? "Maghanap ng evacuation center" : "Search evacuation centers"} />
          </label>
          <button
            onClick={() =>
              speakText(
                displayCenters
                  .map(
                    center =>
                      `${center.displayName} is ${center.status === "OPEN" ? t.open.toLowerCase() : center.status.toLowerCase()}, with ${center.maximumCapacity - center.currentOccupancy} spaces available.`
                  )
                  .join(" ")
              )
            }
            aria-label={t.readCenters}
          >
            <Volume2 size={20} />
          </button>
        </section>
        <section className="citizen-centers">
          {visibleCenters.length === 0 && (
            <p className="citizen-centers-empty" role="status">
              {t.noCentersFound}
            </p>
          )}
          {visibleCenters.map(center => {
            const available = Math.max(
              0,
              center.maximumCapacity - center.currentOccupancy
            );
            const distance = (center as { distance?: number }).distance;
            const centerLat = Number(center.latitude);
            const centerLng = Number(center.longitude);
            const isOpen = center.status === "OPEN";
            return (
              <article
                className="citizen-center-card"
                key={String(center.name)}
              >
                <div className="citizen-center-icon">
                  <Building2 size={24} />
                </div>
                <div className="citizen-center-copy">
                  <div className="citizen-card-top">
                    <strong>{String(center.displayName)}</strong>
                    <span
                      className={`citizen-status ${isOpen ? "open" : "closed"}`}
                    >
                      {isOpen ? t.open : center.status}
                    </span>
                  </div>
                  <p>
                    <MapPin size={14} /> {String(center.displayAddress)}
                  </p>
                  <div className="citizen-capacity">
                    <div>
                      <strong>{available}</strong>
                      <small>{t.spaces}</small>
                    </div>
                    <span>
                      {center.currentOccupancy}{" "}
                      {language === "fil" ? "sa" : "of"}{" "}
                      {center.maximumCapacity} {t.people}
                    </span>
                  </div>
                  <ProgressBar
                    value={
                      (center.currentOccupancy / center.maximumCapacity) * 100
                    }
                  />
                  <div className="citizen-center-actions">
                    {distance !== undefined && (
                      <span>
                        {distance.toFixed(1)} {t.kmAway}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => showDirections(center)}
                    >
                      <MapPin size={14} /> {t.directions}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
        <section className="citizen-map-section">
          <div className="citizen-section-head">
            <div>
              <span className="eyebrow">{t.nearby}</span>
              <h2>
                {language === "fil"
                  ? "Mapa at direksyon"
                  : "Map and directions"}
              </h2>
              <p>
                {usingCachedCenters || !isOnline
                  ? language === "fil"
                    ? "Offline na mapa: ginagamit ang huling naka-save na listahan ng mga center."
                    : "Offline map: using the last saved center list."
                  : language === "fil"
                    ? "Makikita ang mga center sa mapa. Pindutin ang Kumuha ng direksyon para buksan ang ruta sa Google Maps."
                    : "See centers on the map. Choose Get directions to open a walking route in Google Maps."}
              </p>
            </div>
          </div>
          {isOnline && (
            <CitizenCenterMap
              centers={displayCenters}
              origin={userLocation}
              directionsLabel={t.directions}
            />
          )}
          {!isOnline && (
            <div className="offline-map-surface" role="status">
              <MapPin size={24} />
              <strong>
                {language === "fil" ? "Offline na mapa" : "Offline map"}
              </strong>
              <span>
                {language === "fil"
                  ? "Ipinapakita ang mga naka-save na center at kanilang lokasyon. Gamitin ang Kumuha ng direksyon kapag may internet."
                  : "Showing saved centers and their coordinates. Get directions will open when internet is available."}
              </span>
              <div
                className="offline-map-plot"
                aria-label={
                  language === "fil"
                    ? "Offline na mapa ng mga evacuation center"
                    : "Offline map of evacuation centers"
                }
              >
                {userLocation && (
                  <span
                    className="offline-map-user"
                    style={{
                      left: `${projectOfflineMapPoint(userLocation).left}%`,
                      top: `${projectOfflineMapPoint(userLocation).top}%`,
                    }}
                    title={
                      language === "fil"
                        ? "Ang inyong lokasyon"
                        : "Your location"
                    }
                  />
                )}{" "}
                {visibleCenters.map(center => {
                  const point = projectOfflineMapPoint({
                    lat: Number(center.latitude),
                    lng: Number(center.longitude),
                  });
                  return (
                    <button
                      type="button"
                      key={String(center.displayName)}
                      className="offline-map-marker"
                      style={{ left: `${point.left}%`, top: `${point.top}%` }}
                      onClick={() => showDirections(center)}
                      title={`${String(center.displayName)} · ${Number(center.latitude).toFixed(4)}, ${Number(center.longitude).toFixed(4)}`}
                    >
                      <MapPin size={16} />
                      <span>{String(center.displayName)}</span>
                    </button>
                  );
                })}
              </div>
              {visibleCenters.map(center => (
                <div
                  key={`row-${String(center.displayName)}`}
                  className="offline-map-row"
                >
                  <MapPin size={14} />
                  <span>{String(center.displayName)}</span>
                  <small>
                    {String(center.displayAddress)} ·{" "}
                    {Number(center.latitude).toFixed(4)},{" "}
                    {Number(center.longitude).toFixed(4)}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="citizen-advice" id="safety-advice">
          <div className="citizen-section-head">
            <div>
              <span className="eyebrow">{t.adviceEyebrow}</span>
              <h2>{t.safetyAdvice}</h2>
              <p>{t.safetyAdviceHelp}</p>
            </div>
            <button
              onClick={() =>
                speakText(
                  visibleAdvice
                    .map(row => buildAdviceSpeech(row, row.steps, language))
                    .join(" "),
                  speechLanguage,
                )
              }
              aria-label={t.readAdvice}
            >
              <Volume2 size={20} />
            </button>
          </div>
          {usingCachedAdvice && (
            <p className="citizen-advice-offline" role="status">
              {t.adviceOffline}
            </p>
          )}
          {adviceFilters.length > 1 && (
            <div className="citizen-advice-filters" role="group" aria-label={t.safetyAdvice}>
              <button
                className={adviceFilter === "ALL" ? "selected" : ""}
                aria-pressed={adviceFilter === "ALL"}
                onClick={() => setAdviceFilter("ALL")}
              >
                {t.allHazards}
              </button>
              {adviceFilters.map(category => (
                <button
                  key={category}
                  className={adviceFilter === category ? "selected" : ""}
                  aria-pressed={adviceFilter === category}
                  onClick={() => setAdviceFilter(category)}
                >
                  {adviceCategoryLabel(category, language)}
                </button>
              ))}
            </div>
          )}
          {visibleAdvice.length === 0 ? (
            <p className="citizen-advice-empty">{t.noAdviceYet}</p>
          ) : (
            visibleAdvice.map(row => {
              const steps = normalizeAdviceSteps(row.steps);
              const open = openAdviceId === row.id;
              return (
                <article
                  className={`citizen-advice-card ${row.isEmergency ? "emergency" : ""}`}
                  key={row.id}
                >
                  <div className="citizen-advice-card-head">
                    <span className="citizen-advice-category">
                      {adviceCategoryLabel(row.category, language)}
                    </span>
                    <button
                      type="button"
                      className="citizen-advice-listen"
                      onClick={() =>
                        speakText(
                          buildAdviceSpeech(row, steps, language),
                          speechLanguage,
                        )
                      }
                      aria-label={t.readAdvice}
                    >
                      <Volume2 size={18} />
                    </button>
                  </div>
                  <h3>{adviceHeadline(row, language)}</h3>
                  <p>{adviceSummaryText(row, language)}</p>
                  {open && (
                    <div className="citizen-advice-detail">
                      <p className="citizen-advice-body">{adviceBodyText(row, language)}</p>
                      {steps.length > 0 && (
                        <ol className="citizen-advice-steps">
                          {steps.map((step, index) => {
                            const text = adviceStepText(step, language);
                            return (
                              <li key={step.id ?? `step-${index + 1}`}>
                                {step.imageUrl && (
                                  <img
                                    src={step.imageUrl}
                                    alt={text.title || adviceHeadline(row, language)}
                                    loading="lazy"
                                  />
                                )}
                                <div>
                                  <strong>
                                    {t.stepWord} {index + 1}
                                    {text.title ? `: ${text.title}` : ""}
                                  </strong>
                                  {text.instruction && <p>{text.instruction}</p>}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                      {row.youtubeId && (
                        <VideoFacade videoId={row.youtubeId} label={adviceHeadline(row, language)} />
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="citizen-advice-toggle"
                    aria-expanded={open}
                    onClick={() => setOpenAdviceId(open ? null : row.id)}
                  >
                    {steps.length > 0
                      ? open
                        ? t.hideSteps
                        : `${t.showSteps} (${steps.length})`
                      : open
                        ? t.hideSteps
                        : t.showSteps}
                    <ChevronRight size={18} />
                  </button>
                </article>
              );
            })
          )}
        </section>
        <DisasterVideoFeed state={videoState} language={language} />
        <DisasterNewsFeed state={newsState} language={language} />
      </main>
      {reportOpen && (
        <div
          className="citizen-modal-backdrop"
          onClick={() => setReportOpen(false)}
        >
          <section
            className="citizen-report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="citizen-report-title"
            onClick={event => event.stopPropagation()}
          >
            <button
              className="citizen-modal-close"
              onClick={() => setReportOpen(false)}
              aria-label="Close report"
            >
              <X size={22} />
            </button>
            {submitted ? (
              <div className="citizen-success">
                <CheckCircle2 size={46} />
                <h2>{submitMode === "queued" ? t.queued : t.sent}</h2>
                <p>
                  {submitMode === "queued"
                    ? t.queuedHelp
                    : language === "fil"
                      ? "Salamat. Makikita ng mga responder ang inyong ulat. Tumawag sa 911 kung may agarang panganib."
                      : "Thank you. Responders can now review your report. If someone is in immediate danger, call 911."}
                </p>
                {submitMode === "queued" && (
                  <a className="sms-fallback" href={smsUrl}>
                    {t.sendSms}
                  </a>
                )}
                {/*
                  US-5 AC 6, made visible. The report reached responders, the
                  photographs did not, and saying "Report sent" without
                  qualifying it would leave a resident believing an incident
                  record carries evidence that is not there. Every attachment
                  is listed with its own state so nothing is silently missing.
                */}
                {pendingReportId != null && (
                  <div className="citizen-photo-pending" role="status">
                    <strong>{t.photoPending}</strong>
                    <p>{t.photoPendingHelp}</p>
                    <ul className="citizen-attach-list">
                      {attachments.map(item => (
                        <li key={item.id}>
                          <span className="citizen-attach-name">{item.file.name}</span>
                          <span className={`citizen-photo-state ${item.status}`}>
                            {item.status === "sent"
                              ? t.photoSent
                              : item.status === "uploading"
                                ? t.sendingPhotos
                                : t.photoPending}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !isOnline ||
                        attachments.some(item => item.status === "uploading")
                      }
                      onClick={() => void runPhotoUploads(pendingReportId)}
                    >
                      {t.retryPhotos}
                    </Button>
                  </div>
                )}
                {pendingReportId == null && queuedWithPhotos && attachments.length > 0 && (
                  <p className="citizen-photo-note" role="status">
                    {t.photosQueued}
                  </p>
                )}
                <Button
                  onClick={() => {
                    setSubmitted(false);
                    setReportOpen(false);
                    // Held photos are only dropped once the resident is done
                    // and nothing still owes. Discarding them while an upload
                    // is outstanding would undo exactly what AC 6 promises.
                    if (!hasOutstanding(attachmentsRef.current)) {
                      commitAttachments([]);
                      setAttachmentError("");
                      setQueuedWithPhotos(false);
                    }
                  }}
                >
                  {t.done}
                </Button>
              </div>
            ) : (
              <>
                <span className="eyebrow">{t.reportEyebrow}</span>
                <h2 id="citizen-report-title">{t.what}</h2>
                {(!isOnline || submitError) && (
                  <p className="offline-report-note" role="alert">
                    {submitError || t.offline}
                  </p>
                )}
                <label className="citizen-input-label">
                  {t.describe}
                  <textarea
                    value={reportText}
                    onChange={event => setReportText(event.target.value)}
                    placeholder={t.example}
                  />
                  <small className="citizen-field-hint">{t.describeMin}</small>
                </label>
                <label className="citizen-input-label">
                  {t.location}
                  <Input
                    value={location}
                    onFocus={() => setLocationPickerOpen(true)}
                    onChange={event => setLocation(event.target.value)}
                    placeholder={
                      language === "fil"
                        ? "Barangay, kalye, o palatandaan"
                        : "Barangay, street, or landmark"
                    }
                  />
                  <small className="citizen-field-hint">{t.locationMin}</small>
                </label>
                {locationPickerOpen && <CitizenLocationPicker latitude={reportLatitude} longitude={reportLongitude} onPick={(latitude, longitude) => { setReportLatitude(latitude); setReportLongitude(longitude); setLocation(`Pinned location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`); }} />}
                <div className="citizen-attachments">
                  <span className="citizen-input-label">{t.attachPhoto}</span>
                  <p className="citizen-attach-help">{t.attachHelp}</p>
                  {/*
                    Two controls rather than one with `capture` set. `capture`
                    opens the camera directly but throws away the option to
                    pick from the library, which acceptance criterion 2 asks
                    for: offered the camera, and still able to choose. Splitting
                    gives both, and the second accepts a PDF as well because
                    evidence is not always a photograph.
                  */}
                  <div className="citizen-attach-buttons">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <Camera size={16} /> {t.takePhoto}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={attachments.length >= MAX_ATTACHMENTS}
                      onClick={() => galleryInputRef.current?.click()}
                    >
                      <ImagePlus size={16} /> {t.choosePhotos}
                    </Button>
                  </div>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={event => {
                      addChosenFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    hidden
                    onChange={event => {
                      addChosenFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {attachmentError && (
                    <p className="citizen-input-error" role="alert">
                      {attachmentRejectionCopy(attachmentError)}
                    </p>
                  )}
                  {!isOnline && attachments.length > 0 && (
                    <p className="citizen-input-error" role="status">
                      {t.photosQueued}
                    </p>
                  )}
                  {attachments.length > 0 && (
                    <ul className="citizen-attach-list">
                      {attachments.map(item => (
                        <li key={item.id}>
                          <span className="citizen-attach-name">{item.file.name}</span>
                          <span className={`citizen-photo-state ${item.status}`}>
                            {item.status === "sent"
                              ? t.photoSent
                              : item.status === "uploading"
                                ? t.sendingPhotos
                                : t.photoPending}
                          </span>
                          {/* Only reachable before submitting: the form is
                              replaced by the confirmation once the report is
                              sent, which is what acceptance criterion 4 asks. */}
                          <button
                            type="button"
                            aria-label={t.removePhoto}
                            onClick={() => removeAttachment(item.id)}
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="citizen-modal-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReportOpen(false);
                      setSubmitError("");
                    }}
                  >
                    {t.cancel}
                  </Button>
                  {(!isOnline || submitError) && (
                    <a className="sms-fallback sms-button" href={smsUrl}>
                      {t.sendSms}
                    </a>
                  )}
                  <Button
                    disabled={
                      reportText.trim().length < 5 ||
                      location.trim().length < 2 ||
                      createReportMutation.isPending
                    }
                    onClick={() => { setSubmitError(""); submitReport(); }}
                  >
                    {createReportMutation.isPending ? t.sending : t.send}{" "}
                    <ChevronRight size={18} />
                  </Button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="citizen-progress"
      aria-label={`${Math.round(value)} percent occupied`}
    >
      <span style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}
