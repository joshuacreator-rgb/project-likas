import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Bell,
  Building2,
  ChevronRight,
  CircleHelp,
  CloudRain,
  Copy,
  KeyRound,
  Droplets,
  FileWarning,
  LayoutDashboard,
  LifeBuoy,
  LoaderCircle,
  LogIn,
  LogOut,
  Map as MapIcon,
  MapPin,
  Menu,
  Package,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
  UserCog,
  UserPlus,
  UserRoundCheck,
  Waves,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { getStaticSession } from "@/lib/staticAuth";
import {
  formatRoleLabel,
  getLoginPath,
  getRegisterPath,
} from "../../../shared/roles";
import { canTransitionReport, alertsVisibleToRole, type ReportStatus } from "../../../shared/operations";
import type { RealtimeStreamPayload } from "../../../shared/citizen";
import { toast } from "sonner";
import CitizenHome from "./CitizenHome";
import RoleOnboarding from "@/components/RoleOnboarding";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocation } from "wouter";
const centerData = [
  {
    name: "R. Tolentino",
    value: 82,
    capacity: 120,
    status: "OPEN",
    tone: "teal",
  },
  {
    name: "Pateros Elem.",
    value: 111,
    capacity: 120,
    status: "NEAR FULL",
    tone: "amber",
  },
  {
    name: "M. L. Quezon",
    value: 48,
    capacity: 80,
    status: "OPEN",
    tone: "teal",
  },
  {
    name: "Sta. Ana Gym",
    value: 96,
    capacity: 150,
    status: "OPEN",
    tone: "teal",
  },
];
const incidents = [
  {
    id: "RPT-2408",
    type: "Flooding",
    location: "Brgy. Sta. Ana",
    priority: "CRITICAL",
    time: "12 min ago",
    color: "rose",
  },
  {
    id: "RPT-2407",
    type: "Road blockage",
    location: "B. Morcilla St.",
    priority: "HIGH",
    time: "38 min ago",
    color: "amber",
  },
  {
    id: "RPT-2406",
    type: "Power outage",
    location: "Brgy. San Roque",
    priority: "MEDIUM",
    time: "1 hr ago",
    color: "blue",
  },
];

type WorkspaceCenter = {
  id: number;
  name: string;
  address: string;
  barangay: string;
  currentOccupancy: number;
  maximumCapacity: number;
  status: string;
  latitude?: string | number;
  longitude?: string | number;
};
type WorkspaceResource = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimumStock: number;
  centerId: number;
  status: string;
};
type WorkspaceReport = {
  id: number;
  reportCode: string;
  reportType: string;
  location: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  assignedResponderId?: number | null;
  priority: string;
  status: string;
  createdAt?: string | Date;
  resolution?: string | null;
};
type IncidentSummary = {
  id: string;
  type: string;
  location: string;
  priority: string;
  time: string;
  color: string;
  reportId?: number;
  status?: string;
  createdAt?: string | Date;
  resolution?: string | null;
  assignedResponderId?: number | null;
};
function relativeTime(value: string | Date | undefined): string {
  if (!value) return "recently";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
const staticCentersStorageKey = "likas-static-centers";
const staticResourcesStorageKey = "likas-static-resources";
const staticReportsStorageKey = "likas-static-reports";
function isStaticSession() {
  return Boolean(getStaticSession() || sessionStorage.getItem("likas-static-demo-role"));
}
function readStaticCenters(): WorkspaceCenter[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(staticCentersStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeStaticCenters(centers: WorkspaceCenter[]) {
  localStorage.setItem(staticCentersStorageKey, JSON.stringify(centers));
}
function readStaticResources(): WorkspaceResource[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(staticResourcesStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeStaticResources(resources: WorkspaceResource[]) {
  localStorage.setItem(staticResourcesStorageKey, JSON.stringify(resources));
}
function readStaticReports(): WorkspaceReport[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(staticReportsStorageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function notifyStaticReportsChanged() {
  window.dispatchEvent(new Event("likas-static-reports-changed"));
}

function MapZoomReset() {
  const map = useMap();
  return (
    <button
      className="map-reset"
      onClick={() => map.setView([14.544, 121.071], 14)}
      aria-label="Reset map view"
    >
      ↺
    </button>
  );
}

function PaterosMapClick({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click: event => onPick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function PaterosLocationPicker({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number;
  longitude: number;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const position: [number, number] = [latitude, longitude];
  return (
    <div className="pateros-location-picker">
      <div className="pateros-picker-label"><MapIcon size={14} /> Pin the center location inside Pateros</div>
      <MapContainer center={position} zoom={14} minZoom={13} maxZoom={18} maxBounds={[[14.53, 121.05], [14.56, 121.09]]} maxBoundsViscosity={1} scrollWheelZoom className="pateros-picker-map">
        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <PaterosMapClick onPick={onPick} />
        <CircleMarker center={position} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#c85f5a", fillOpacity: 1 }} />
      </MapContainer>
      <small>Selected coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}</small>
    </div>
  );
}

function StatusPill({
  children,
  tone = "teal",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export default function Home() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [active, setActive] = useState("Overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState("");
  const [reportLocation, setReportLocation] = useState("");
  const [reportLatitude, setReportLatitude] = useState("14.544000");
  const [reportLongitude, setReportLongitude] = useState("121.071000");
  const [reportLocationPickerOpen, setReportLocationPickerOpen] = useState(false);
  const [reportPriority, setReportPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("HIGH");
  const [reportDescription, setReportDescription] = useState("");
  const [search, setSearch] = useState("");
  const [incidentFilter, setIncidentFilter] = useState("All");
  const [mapFilter, setMapFilter] = useState("All");
  const [submitted, setSubmitted] = useState(false);
  const [evidenceName, setEvidenceName] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<IncidentSummary | null>(null);
  const [selectedIncidentReportId, setSelectedIncidentReportId] = useState<number | null>(null);
  const [responderNotified, setResponderNotified] = useState(false);
  const [assignTarget, setAssignTarget] = useState(0);
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const notifyResponders = trpc.operations.notifyResponders.useMutation({
    onSuccess: () => setResponderNotified(true),
  });
  const { data: responders } = trpc.operations.listResponders.useQuery(undefined, {
    enabled: (isAdmin || isStaff) && Boolean(selectedIncident) && !isStaticSession(),
  });
  const assignResponderMutation = trpc.operations.assignResponder.useMutation({
    onSuccess: result => {
      setSelectedIncident(previous =>
        previous ? { ...previous, assignedResponderId: result.assignedResponderId } : previous
      );
      setAssignTarget(result.assignedResponderId ?? 0);
      utils.operations.reports.invalidate();
      utils.operations.incidentTimeline.invalidate();
    },
  });
  const claimIncidentMutation = trpc.operations.claimIncident.useMutation({
    onSuccess: () => {
      utils.operations.reports.invalidate();
      utils.operations.incidentTimeline.invalidate();
    },
  });
  const { data: incidentTimeline, isLoading: incidentTimelineLoading, error: incidentTimelineError } = trpc.operations.incidentTimeline.useQuery(
    { reportId: selectedIncidentReportId ?? 0 },
    { enabled: selectedIncidentReportId !== null && !isStaticSession() }
  );
  const utils = trpc.useUtils();
  const createReportMutation = trpc.operations.createRiskReport.useMutation({
    onSuccess: () => setSubmitted(true),
  });
  const [largeText, setLargeText] = useState(
    () => window.localStorage.getItem("likas-large-text") === "true"
  );
  const isCitizen = user?.role === "citizen" || user?.role === "user";
  const { data: liveCenters } = trpc.operations.centers.useQuery();
  const [staticCenters, setStaticCenters] = useState<WorkspaceCenter[]>(readStaticCenters);
  const [staticResources, setStaticResources] = useState<WorkspaceResource[]>(readStaticResources);
  const staticSession = isStaticSession();
  const { data: liveSummary } = trpc.operations.summary.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 1500,
  });
  const { data: liveAlerts } = trpc.operations.alerts.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 1500,
  });
  const alertsForRole = alertsVisibleToRole(liveAlerts, user?.role);
  useEffect(() => {
    if (
      !user ||
      staticSession ||
      (user.role !== "responder" && user.role !== "staff" && user.role !== "admin") ||
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
      if (payload.type === "connected") return;
      if (payload.type === "incident") {
        toast(payload.data.reportType, {
          description: `${payload.data.location} · ${payload.data.priority} priority`,
          duration: 10000,
        });
        utils.operations.reports.invalidate();
        utils.operations.summary.invalidate();
      } else if (payload.type === "alert") {
        toast(payload.data.title, {
          description: payload.data.message,
          duration: 12000,
        });
        utils.operations.alerts.invalidate();
      } else if (payload.type === "assignment") {
        if (user.role === "responder" && payload.data.assignedResponderId === user.id) {
          toast("You've been assigned an incident", {
            description: "Open Risk reports to view it.",
            duration: 10000,
          });
        }
        utils.operations.reports.invalidate();
      }
    };
    return () => source.close();
  }, [user, staticSession, utils]);
  const isResponder = user?.role === "responder";
  const { data: liveReports } = trpc.operations.reports.useQuery(undefined, {
    enabled:
      !staticSession &&
      Boolean(user) &&
      (isAdmin || isStaff || isResponder),
    refetchInterval: 1500,
    refetchOnWindowFocus: true,
  });
  const { data: liveResources } = trpc.operations.resources.useQuery(
    {},
    {
      enabled: !staticSession && (isAdmin || isStaff),
      refetchInterval: 1500,
    }
  );
  const activeOverviewIncidents = useMemo(
    () => (liveReports ?? []).filter(report => report.status !== "RESOLVED"),
    [liveReports]
  );
  const belowMinimumResources = useMemo(
    () =>
      (liveResources ?? []).filter(resource => resource.quantity <= resource.minimumStock).length,
    [liveResources]
  );
  const availableResourceCount = useMemo(
    () =>
      (liveResources ?? []).filter(resource => resource.quantity > resource.minimumStock).length,
    [liveResources]
  );
  const resourceChartData = useMemo(() => {
    if (staticSession)
      return [
        { n: "Food", v: 91 },
        { n: "Water", v: 84 },
        { n: "Medicine", v: 72 },
        { n: "Hygiene", v: 58 },
        { n: "Blankets", v: 47 },
      ];
    const byCategory = new Map<string, number>();
    for (const resource of liveResources ?? []) {
      byCategory.set(
        resource.category,
        (byCategory.get(resource.category) ?? 0) + resource.quantity
      );
    }
    return Array.from(byCategory.entries())
      .map(([category, quantity]) => ({ n: category, v: quantity }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);
  }, [staticSession, liveResources]);
  const criticalIncidentCount = activeOverviewIncidents.filter(
    incident => incident.priority === "CRITICAL"
  ).length;
  const unassignedIncidentCount = activeOverviewIncidents.filter(
    incident => !incident.assignedResponderId
  ).length;
  const assignedIncidentCount =
    activeOverviewIncidents.length - unassignedIncidentCount;
  const centerUtilization = useMemo(() => {
    const capacity = Number(liveSummary?.capacity ?? 0);
    const occupancy = Number(liveSummary?.occupancy ?? 0);
    if (capacity <= 0) return 0;
    return Math.min(100, Math.round((occupancy / capacity) * 100));
  }, [liveSummary]);
  const readinessPercent = useMemo(() => {
    if (staticSession) return 86;
    const total = activeOverviewIncidents.length;
    if (total === 0) return 0;
    return Math.round(
      (activeOverviewIncidents.filter(incident => incident.assignedResponderId).length /
        total) *
        100
    );
  }, [staticSession, activeOverviewIncidents]);
  const { data: liveWeather } = trpc.operations.weather.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 60000,
  });
  const [lastSynced, setLastSynced] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setLastSynced(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const pendingCitizenReportCount = useMemo(
    () =>
      (liveReports ?? []).filter(
        report =>
          report.status === "PENDING" &&
          /citizen emergency/i.test(report.reportType)
      ).length,
    [liveReports]
  );
  const displayCenters = useMemo(() => {
    const source = staticSession ? staticCenters : liveCenters;
    if (!source?.length) return staticSession ? centerData : [];
    return source.map(center => ({
      name: center.name,
      value: center.currentOccupancy,
      capacity: center.maximumCapacity,
      status:
        center.status === "OPEN" &&
        center.currentOccupancy / center.maximumCapacity > 0.85
          ? "NEAR FULL"
          : center.status,
      tone: center.status === "FULL" ? "amber" : "teal",
    }));
  }, [liveCenters, staticCenters, staticSession]);
  const queueIncidents = useMemo(() => {
    const source = staticSession
      ? incidents
      : (liveReports ?? [])
          .filter(report => report.status !== "RESOLVED")
          .map(report => ({
            id: report.reportCode,
            type: report.reportType,
            location: report.location,
            priority: report.priority,
            time: report.createdAt ? relativeTime(report.createdAt) : "recently",
            color:
              report.priority === "CRITICAL"
                ? "rose"
                : report.priority === "HIGH"
                  ? "amber"
                  : "blue",
            reportId: report.id,
            status: report.status,
            createdAt: report.createdAt,
            assignedResponderId: report.assignedResponderId ?? null,
          }));
    return source.filter(
      item =>
        (incidentFilter === "All" || item.priority === incidentFilter) &&
        `${item.id} ${item.type} ${item.location} ${item.priority}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
    );
  }, [staticSession, liveReports, incidentFilter, search]);
  const visibleCenters = useMemo(
    () =>
      displayCenters.filter(
        item =>
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          search.trim() === ""
      ),
    [search]
  );

  const nav = user?.role === "admin"
    ? [
        { label: "Overview", icon: LayoutDashboard },
        { label: "Evacuation centers", icon: Building2 },
        { label: "Evacuees", icon: Users },
        { label: "Resources", icon: Package },
        { label: "Incident map", icon: MapIcon },
        { label: "Risk reports", icon: AlertTriangle },
        { label: "Alerts", icon: Bell },
        { label: "User & roles", icon: UserCog },
      ]
    : user?.role === "responder"
      ? [
          { label: "Overview", icon: LayoutDashboard },
          { label: "Incident map", icon: MapIcon },
          { label: "Risk reports", icon: AlertTriangle },
          { label: "Alerts", icon: Bell },
          { label: "Security", icon: ShieldCheck },
        ]
      : user?.role === "staff"
        ? [
            { label: "Overview", icon: LayoutDashboard },
            { label: "Evacuation centers", icon: Building2 },
            { label: "Evacuees", icon: Users },
            { label: "Resources", icon: Package },
            { label: "Alerts", icon: Bell },
          ]
      : [
          { label: "Overview", icon: LayoutDashboard },
          { label: "Evacuation centers", icon: Building2 },
          { label: "Evacuees", icon: Users },
          { label: "Resources", icon: Package },
          { label: "Alerts", icon: Bell },
        ];
  const secondary = user?.role === "admin"
    ? [
        { label: "Activity log", icon: Activity },
        { label: "Settings", icon: Settings },
      ]
    : [];

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function openIncident(incident: IncidentSummary, reportId?: number) {
    setSelectedIncident(incident);
    setSelectedIncidentReportId(reportId ?? null);
    setAssignTarget(incident.assignedResponderId ?? 0);
    setResponderNotified(false);
    notifyResponders.reset();
  }

  function handleNotifyResponders() {
    if (!selectedIncident || notifyResponders.isPending) return;
    if (sessionStorage.getItem("likas-static-demo-role")) {
      setResponderNotified(true);
      return;
    }
    notifyResponders.mutate({
      incidentId: selectedIncident.id,
      incidentType: selectedIncident.type,
      location: selectedIncident.location,
      priority: selectedIncident.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    });
  }

  function submitReport() {
    if (!reportType.trim() || !reportLocation.trim() || !reportDescription.trim()) return;
    if (isStaticSession()) {
      const reports = JSON.parse(localStorage.getItem("likas-static-reports") || "[]");
      reports.unshift({
        id: -Date.now(),
        reportCode: `RPT-${Date.now().toString(36).toUpperCase()}`,
        reportType,
        location: reportLocation,
        latitude: reportLatitude,
        longitude: reportLongitude,
        priority: reportPriority,
        status: "PENDING",
      });
      localStorage.setItem("likas-static-reports", JSON.stringify(reports));
      notifyStaticReportsChanged();
      setSubmitted(true);
      return;
    }
    createReportMutation.mutate({
      reportCode: `RPT-${Date.now().toString(36).toUpperCase()}`,
      reportType,
      location: reportLocation,
      priority: reportPriority,
      description: reportDescription,
      latitude: Number(reportLatitude),
      longitude: Number(reportLongitude),
    });
  }

  if (isCitizen) return <CitizenHome />;
  const dashboardRole = user?.role ?? "admin";
  return (
    <div className={`likas-app internal-shell ${dashboardRole}-shell ${largeText ? "large-text" : ""}`}>
      <RoleOnboarding role={user?.role} />
      <aside className={`likas-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <ShieldCheck size={21} />
          </div>
          <div>
            <strong>PROJECT LIKAS</strong>
            <span>Emergency operations</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">PATEROS · METRO MANILA</div>
        <nav className="side-nav">
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => {
                setActive(label);
                setSidebarOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "Alerts" && alertsForRole.length > 0 && <em>{alertsForRole.length}</em>}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <div className="workspace-label">MANAGEMENT</div>
        <nav className="side-nav">
          {secondary.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => setActive(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="readiness-card">
            <div className="readiness-head">
              <span>Response readiness</span>
              <span>{readinessPercent}%</span>
            </div>
            <Progress value={readinessPercent} />
            <small>
              {activeOverviewIncidents.length === 0
                ? "No active incidents — team ready"
                : `${assignedIncidentCount} of ${activeOverviewIncidents.length} active incidents assigned`}
            </small>
          </div>
          <div className="signed-user">
            <div className="avatar">{user?.name?.[0] || "A"}</div>
            <div>
              <strong>{user?.name || "Operations lead"}</strong>
              <span>{formatRoleLabel(user?.role)}</span>
            </div>
            <ChevronRight size={15} />
          </div>
        </div>
      </aside>

      <main className="likas-main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Operations</span>
            <ChevronRight size={14} />
            <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <div className="search-box">
              <Search size={16} />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search operations"
              />
            </div>
            {isResponder && (
              <button
                type="button"
                className="icon-button notification"
                onClick={() => setActive("Risk reports")}
                aria-label={
                  pendingCitizenReportCount > 0
                    ? `View risk reports, ${pendingCitizenReportCount} new citizen report${pendingCitizenReportCount === 1 ? "" : "s"}`
                    : "View risk reports"
                }
              >
                <Bell size={18} />
                {pendingCitizenReportCount > 0 ? <i aria-hidden /> : null}
              </button>
            )}
            {isCitizen && <Button
              className="report-button"
              onClick={() => setReportOpen(true)}
            >
              <Siren size={17} /> Report an emergency
            </Button>}
            <Button variant="outline" className="logout-button" onClick={handleLogout}>
              <LogOut size={16} /> Log out
            </Button>
          </div>
        </header>

        <div
          className={`content-wrap ${active !== "Overview" ? "show-secondary" : ""}`}
        >
          <WorkspaceView active={active} search={search} centers={staticSession ? staticCenters : liveCenters} resources={staticSession ? staticResources : undefined} onStaticCentersChange={setStaticCenters} onStaticResourcesChange={setStaticResources} onOpenIncident={openIncident} />
          {active === "Overview" && <>
          <section className="hero-row">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> LIVE OPERATIONS · 23 AUG 2026,
                14:32
              </div>
               <h1>
                 {isCitizen
                   ? "Welcome. How can we help today?"
                   : user?.role === "admin"
                     ? "Good afternoon, Administrator."
                     : user?.role === "staff"
                       ? "Good afternoon, Center Staff."
                       : user?.role === "responder"
                         ? "Good afternoon, Disaster Responder Team."
                         : "Good afternoon, command desk."}
               </h1>
              <p>
                {isCitizen
                  ? "Use the clear actions below to report danger or find support near you."
                  : "Here’s the situation across Pateros. Stay ahead of the next move."}
              </p>
            </div>
            <div className="weather-chip">
              <div className="weather-icon">
                <CloudRain size={22} />
              </div>
              <div>
                <strong>
                  {liveWeather?.temperature != null
                    ? `${Math.round(liveWeather.temperature)}°`
                    : "—"}{" "}
                  <span>{liveWeather?.condition ?? "Weather"}</span>
                </strong>
                <small>
                  {liveWeather?.warning ??
                    `Live weather · ${liveWeather?.provider ?? "unavailable"}`}
                </small>
              </div>
              <span className="weather-place">
                {liveWeather?.location ?? "Pateros"}
              </span>
            </div>
          </section>

          <section className="metric-grid">
            <div className="metric-card accent">
              <div className="metric-icon">
                <Building2 size={18} />
              </div>
              <span>Evacuation centers</span>
              <strong>{liveSummary?.centers ?? 0}</strong>
              <small>
                <b>{liveCenters?.filter(c => c.status === "OPEN").length ?? 0} open</b>
                {" · "}
                {liveSummary?.availableSlots ?? 0} slots free
              </small>
            </div>
            <div className="metric-card">
              <div className="metric-icon blue">
                <Users size={18} />
              </div>
              <span>Registered evacuees</span>
              <strong>{liveSummary?.evacuees ?? 0}</strong>
              <small>
                <b>{liveSummary?.occupancy ?? 0} occupying</b>
                {" · "}
                {liveSummary?.capacity ?? 0} total capacity
              </small>
            </div>
            <div className="metric-card">
              <div className="metric-icon amber">
                <Package size={18} />
              </div>
              <span>Available resources</span>
              <strong>{liveSummary?.resources ?? 0}</strong>
              <small>
                <b className={belowMinimumResources > 0 ? "warning" : ""}>
                  {belowMinimumResources} items
                </b>{" "}
                below minimum
              </small>
            </div>
            <div className="metric-card">
              <div className="metric-icon rose">
                <AlertTriangle size={18} />
              </div>
              <span>Active incidents</span>
              <strong>{activeOverviewIncidents.length}</strong>
              <small>
                <b className={criticalIncidentCount > 0 ? "critical" : ""}>
                  {criticalIncidentCount} critical
                </b>
                {" · "}
                {unassignedIncidentCount} unassigned
              </small>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="panel occupancy-panel">
              <div className="panel-head">
                <div>
                  <h2>Center utilization</h2>
                  <p>Live occupancy against total capacity</p>
                </div>
                <StatusPill>LIVE</StatusPill>
              </div>
              <div className="chart-stat">
                <strong>{centerUtilization}%</strong>
                <small>
                  {liveSummary?.occupancy ?? 0} occupying ·{" "}
                  {liveSummary?.availableSlots ?? 0} slots open
                </small>
              </div>
              <div className="occupancy-util">
                <Progress value={centerUtilization} />
                <small>
                  of {liveSummary?.capacity ?? 0} total capacity across centers
                </small>
              </div>
            </div>
            <div className="panel centers-panel">
              <div className="panel-head">
                <div>
                  <h2>Center status</h2>
                  <p>Capacity and occupancy at a glance</p>
                </div>
                {user?.role !== "responder" && (
                  <button
                    className="text-button"
                    onClick={() => setActive("Evacuation centers")}
                  >
                    View all <ChevronRight size={14} />
                  </button>
                )}
              </div>
              <div className="center-list">
                {visibleCenters.map(center => (
                  <div className="center-row" key={center.name}>
                    <div className="center-symbol">
                      <Building2 size={16} />
                    </div>
                    <div className="center-info">
                      <strong>{center.name}</strong>
                      <span>
                        {center.value} / {center.capacity} people
                      </span>
                    </div>
                    <div className="center-meter">
                      <Progress
                        value={(center.value / center.capacity) * 100}
                      />
                      <small>
                        {Math.round((center.value / center.capacity) * 100)}%
                      </small>
                    </div>
                    <StatusPill tone={center.tone}>{center.status}</StatusPill>
                  </div>
                ))}
                {visibleCenters.length === 0 && (
                  <p className="empty-copy">No centers available yet.</p>
                )}
              </div>
            </div>
          </section>

          <section className="lower-grid">
            {isResponder && <div className="panel incidents-panel">
              <div className="panel-head">
                <div>
                  <h2>Incident queue</h2>
                  <p>Reports requiring operational attention</p>
                </div>
                <div className="filter-tabs">
                  {["All", "CRITICAL", "HIGH"].map(filter => (
                    <button
                      key={filter}
                      className={incidentFilter === filter ? "selected" : ""}
                      onClick={() => setIncidentFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
              <div className="incident-list">
                {queueIncidents.map(incident => (
                  <button
                    className="incident-row"
                    key={incident.id}
                    onClick={() => openIncident(incident)}
                  >
                    <div className={`incident-priority ${incident.color}`}>
                      <AlertTriangle size={16} />
                    </div>
                    <div className="incident-info">
                      <strong>
                        {incident.type} <span>{incident.id}</span>
                      </strong>
                      <p>
                        {incident.location} · {incident.time}
                      </p>
                    </div>
                    <StatusPill
                      tone={incident.color === "rose" ? "rose" : incident.color}
                    >
                      {incident.priority}
                    </StatusPill>
                    <ChevronRight size={16} className="row-arrow" />
                  </button>
                ))}
                {queueIncidents.length === 0 && (
                  <p className="empty-copy">
                    No active incidents right now. New reports will appear here
                    live.
                  </p>
                )}
              </div>
              <button
                className="panel-footer-action"
                onClick={() => setActive("Risk reports")}
              >
                Open incident workspace <ChevronRight size={15} />
              </button>
            </div>}
            {(isAdmin || isStaff) && <div className="panel resources-panel">
              <div className="panel-head">
                <div>
                  <h2>Resource availability</h2>
                  <p>Live stock across operational centers</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActive("Resources")}
                >
                  Manage <ChevronRight size={14} />
                </button>
              </div>
              <div className="resource-chart">
                {resourceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={176}>
                    <BarChart
                      data={resourceChartData}
                      layout="vertical"
                      margin={{ left: 4, right: 12 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="n"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#687b79", fontSize: 11 }}
                        width={72}
                      />
                      <Tooltip
                        cursor={{ fill: "#f3f7f6" }}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid #e1e9e7",
                        }}
                        formatter={value => [`${value}`, "Units on hand"]}
                      />
                      <Bar
                        dataKey="v"
                        fill="#51b9ac"
                        radius={[0, 5, 5, 0]}
                        barSize={13}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="empty-copy">
                    No resources have been recorded yet.
                  </p>
                )}
              </div>
              <div className="resource-footer">
                <span>
                  <i className="dot teal" /> {availableResourceCount} healthy
                </span>
                <span>
                  <i className="dot amber" /> {belowMinimumResources} below minimum
                </span>
              </div>
            </div>}
          </section>

          <section className="map-alert-grid">
            <div className="panel map-panel">
              <div className="panel-head map-head">
                <div>
                  <h2>Operational map</h2>
                  <p>Evacuation centers and live reports</p>
                </div>
                <div className="map-tools">
                  <div className="map-filter-tabs">
                    {["All", "Centers", "Incidents"].map(filter => (
                      <button
                        key={filter}
                        className={mapFilter === filter ? "selected" : ""}
                        onClick={() => setMapFilter(filter)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <div className="map-legend">
                    <span>
                      <i className="map-dot teal" /> Centers
                    </span>
                    <span>
                      <i className="map-dot rose" /> Incidents
                    </span>
                  </div>
                </div>
              </div>
              <div className="map-frame">
                <MapContainer
                  center={[14.544, 121.071]}
                  zoom={14}
                  scrollWheelZoom={false}
                  zoomControl={true}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapZoomReset />
                  {staticSession ? (
                    <>
                      {(mapFilter === "All" || mapFilter === "Centers") && (
                        <>
                          <CircleMarker
                            center={[14.546, 121.074]}
                            radius={10}
                            pathOptions={{
                              color: "#177f78",
                              fillColor: "#31b1a5",
                              fillOpacity: 0.9,
                            }}
                          >
                            <Popup>
                              <strong>Rizal Tolentino Center</strong>
                              <br />
                              82 / 120 occupants · OPEN
                            </Popup>
                          </CircleMarker>
                          <CircleMarker
                            center={[14.548, 121.066]}
                            radius={10}
                            pathOptions={{
                              color: "#177f78",
                              fillColor: "#31b1a5",
                              fillOpacity: 0.9,
                            }}
                          >
                            <Popup>
                              <strong>M. L. Quezon Center</strong>
                              <br />
                              48 / 80 occupants · OPEN
                            </Popup>
                          </CircleMarker>
                        </>
                      )}
                      {(mapFilter === "All" || mapFilter === "Incidents") && (
                        <>
                          <CircleMarker
                            center={[14.541, 121.068]}
                            radius={10}
                            pathOptions={{
                              color: "#c85f5a",
                              fillColor: "#ef8b82",
                              fillOpacity: 0.9,
                            }}
                          >
                            <Popup>
                              <strong>RPT-2408 · Flooding</strong>
                              <br />
                              Brgy. Sta. Ana · CRITICAL
                            </Popup>
                          </CircleMarker>
                          <CircleMarker
                            center={[14.537, 121.075]}
                            radius={10}
                            pathOptions={{
                              color: "#d89b3f",
                              fillColor: "#f3be61",
                              fillOpacity: 0.9,
                            }}
                          >
                            <Popup>
                              <strong>RPT-2407 · Road blockage</strong>
                              <br />
                              B. Morcilla St. · HIGH
                            </Popup>
                          </CircleMarker>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {(mapFilter === "All" || mapFilter === "Centers") &&
                        (liveCenters ?? [])
                          .filter(
                            center =>
                              center.latitude != null && center.longitude != null
                          )
                          .map(center => (
                            <CircleMarker
                              key={center.id}
                              center={[
                                Number(center.latitude),
                                Number(center.longitude),
                              ]}
                              radius={10}
                              pathOptions={{
                                color: "#177f78",
                                fillColor: "#31b1a5",
                                fillOpacity: 0.9,
                              }}
                            >
                              <Popup>
                                <strong>{center.name}</strong>
                                <br />
                                {center.currentOccupancy} /{" "}
                                {center.maximumCapacity} occupants ·{" "}
                                {center.status}
                              </Popup>
                            </CircleMarker>
                          ))}
                      {(mapFilter === "All" || mapFilter === "Incidents") &&
                        (liveReports ?? [])
                          .filter(
                            report =>
                              report.status !== "RESOLVED" &&
                              report.latitude != null &&
                              report.longitude != null
                          )
                          .map(report => (
                            <CircleMarker
                              key={report.id}
                              center={[
                                Number(report.latitude),
                                Number(report.longitude),
                              ]}
                              radius={10}
                              pathOptions={{
                                color:
                                  report.priority === "CRITICAL"
                                    ? "#c85f5a"
                                    : "#d89b3f",
                                fillColor:
                                  report.priority === "CRITICAL"
                                    ? "#ef8b82"
                                    : "#f3be61",
                                fillOpacity: 0.9,
                              }}
                            >
                              <Popup>
                                <strong>
                                  {report.reportCode} · {report.reportType}
                                </strong>
                                <br />
                                {report.location} · {report.priority} ·{" "}
                                {report.status}
                              </Popup>
                            </CircleMarker>
                          ))}
                    </>
                  )}
                </MapContainer>
                <div className="map-overlay">
                  <Search size={15} />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search a barangay or center"
                  />
                </div>
              </div>
            </div>
            {user?.role !== "admin" && <div className="panel alerts-panel">
              <div className="panel-head">
                <div>
                  <h2>Alert center</h2>
                  <p>Targeted operational notifications</p>
                </div>
                <span className="alert-count">{alertsForRole.length} active</span>
              </div>
              <div className="alert-list">
                {alertsForRole.slice(0, 5).map(alert => (
                  <div className={`alert-item${alert.priority === "CRITICAL" || alert.priority === "HIGH" ? " critical" : ""}`} key={alert.id}>
                    <div className="alert-symbol">
                      <AlertTriangle size={17} />
                    </div>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                      <small>{new Date(alert.createdAt).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
                {alertsForRole.length === 0 && (
                  <div className="alert-item">
                    <div className="alert-symbol">
                      <ShieldCheck size={17} />
                    </div>
                    <div>
                      <strong>No active alerts</strong>
                      <p>Your team has no open notifications right now.</p>
                    </div>
                  </div>
                )}
              </div>
              <button
                className="panel-footer-action"
                onClick={() => setActive("Alerts")}
              >
                View all alerts <ChevronRight size={15} />
              </button>
            </div>}
          </section>
          <footer className="page-footer">
            <span>
              <span className="live-dot" /> All systems operational
            </span>
            <span>
              Last synced {lastSynced.toLocaleTimeString()} ·{" "}
              <button onClick={() => setSubmitted(false)}>Refresh data</button>
            </span>
            <span>
              <CircleHelp size={14} /> Need help?
            </span>
            <button
              className="accessibility-toggle"
              onClick={() =>
                setLargeText(value => {
                  const next = !value;
                  window.localStorage.setItem("likas-large-text", String(next));
                  return next;
                })
              }
              aria-pressed={largeText}
            >
              {largeText ? "Standard text" : "Larger text"}
            </button>
          </footer>
          </>}
        </div>
      </main>

      {selectedIncident && (
        <div className="modal-backdrop" onClick={() => setSelectedIncident(null)}>
          <div className="report-modal incident-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <div>
                <span className="eyebrow">INCIDENT DETAILS</span>
                <h2>{selectedIncident.type}</h2>
              </div>
              <button onClick={() => setSelectedIncident(null)} aria-label="Close incident details">
                <X size={18} />
              </button>
            </div>
            <div className="incident-detail-grid">
              <div><small>Reference</small><strong>{selectedIncident.id}</strong></div>
              <div><small>Priority</small><strong className={`incident-detail-priority ${selectedIncident.color}`}>{selectedIncident.priority}</strong></div>
              <div><small>Location</small><strong>{selectedIncident.location}</strong></div>
              <div><small>Reported</small><strong>{selectedIncident.time}</strong></div>
            </div>
            <div className="incident-timeline">
              <div className="incident-timeline-head">
                <div>
                  <span className="eyebrow">ACTIVITY</span>
                  <h3>Incident timeline</h3>
                </div>
                {incidentTimelineLoading && <LoaderCircle className="login-spinner" size={17} aria-label="Loading timeline" />}
              </div>
              <div className="incident-timeline-list">
                {incidentTimelineError && (
                  <div className="incident-timeline-notice" role="alert">
                    {incidentTimelineError.message.includes("assigned")
                      ? "This incident isn't assigned to you. Ask an administrator to assign it, or claim it below."
                      : incidentTimelineError.message}
                  </div>
                )}
                <div className="incident-timeline-event">
                  <span className="incident-timeline-dot" />
                  <div><strong>Report received</strong><small>{selectedIncident.createdAt ? new Date(selectedIncident.createdAt).toLocaleString() : selectedIncident.time}</small><p>Incident was logged at {selectedIncident.location}.</p></div>
                </div>
                {incidentTimeline?.report.assignedResponderId && <div className="incident-timeline-event"><span className="incident-timeline-dot" /><div><strong>Responder assigned</strong><small>Assignment recorded</small><p>The incident is assigned to the response team.</p></div></div>}
                {incidentTimeline?.actions.map(action => <div className="incident-timeline-event" key={action.id}><span className="incident-timeline-dot" /><div><strong>{action.action}</strong><small>{new Date(action.createdAt).toLocaleString()}</small>{action.resourcesUsed && <p>Resources used: {action.resourcesUsed}</p>}{action.arrivalAt && <p>Arrived: {new Date(action.arrivalAt).toLocaleString()}</p>}{action.completedAt && <p>Completed: {new Date(action.completedAt).toLocaleString()}</p>}</div></div>)}
                {selectedIncident.status === "RESOLVED" && <div className="incident-timeline-event"><span className="incident-timeline-dot complete" /><div><strong>Incident resolved</strong><small>Resolution recorded</small>{selectedIncident.resolution && <p>{selectedIncident.resolution}</p>}</div></div>}
              </div>
            </div>
            <div className="incident-assignment">
              <div className="incident-assignment-head">
                <span className="eyebrow">RESPONDER ASSIGNMENT</span>
              </div>
              {!isStaticSession() && (isAdmin || isStaff) && (
                <>
                  <label className="assignment-select-label">
                    Assigned responder
                    <select
                      className="role-select"
                      aria-label="Assign responder"
                      value={assignTarget}
                      onChange={e => setAssignTarget(Number(e.target.value))}
                    >
                      <option value={0}>Unassigned</option>
                      {(responders ?? []).map(responder => (
                        <option key={responder.id} value={responder.id}>
                          {responder.name} · {responder.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="assignment-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        selectedIncidentReportId !== null &&
                        assignResponderMutation.mutate({
                          reportId: selectedIncidentReportId,
                          responderId: assignTarget || null,
                        })
                      }
                      disabled={assignResponderMutation.isPending}
                    >
                      {assignResponderMutation.isPending
                        ? "Saving…"
                        : assignTarget === 0
                          ? "Remove assignment"
                          : "Assign responder"}
                    </Button>
                    {assignResponderMutation.isSuccess && (
                      <p className="incident-notified" role="status">
                        <CheckCircle2 size={16} /> Assignment saved.
                      </p>
                    )}
                    {assignResponderMutation.error && (
                      <p className="login-error" role="alert">
                        {assignResponderMutation.error.message}
                      </p>
                    )}
                  </div>
                </>
              )}
              {!isStaticSession() && isResponder && (
                selectedIncident.assignedResponderId === user?.id ? (
                  <p className="incident-notified" role="status">
                    <ShieldCheck size={16} /> You are the assigned responder for this incident.
                  </p>
                ) : selectedIncident.assignedResponderId ? (
                  <p className="assignment-other">
                    <UserCog size={15} /> This incident is assigned to another responder.
                  </p>
                ) : (
                  <div className="assignment-actions">
                    <Button
                      type="button"
                      onClick={() =>
                        selectedIncidentReportId !== null &&
                        claimIncidentMutation.mutate({ reportId: selectedIncidentReportId })
                      }
                      disabled={claimIncidentMutation.isPending}
                    >
                      {claimIncidentMutation.isPending ? "Claiming…" : "Claim this incident"}
                    </Button>
                    {claimIncidentMutation.isSuccess && (
                      <p className="incident-notified" role="status">
                        <CheckCircle2 size={16} /> Incident claimed — it is now assigned to you.
                      </p>
                    )}
                    {claimIncidentMutation.error && (
                      <p className="login-error" role="alert">
                        {claimIncidentMutation.error.message}
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
            {(isAdmin || isStaff) &&
              (responderNotified ? (
                <div className="incident-notified" role="status">
                  <CheckCircle2 size={18} /> Responder / Disaster Team has been
                  notified.
                </div>
              ) : (
                <Button
                  onClick={handleNotifyResponders}
                  disabled={notifyResponders.isPending}
                >
                  {notifyResponders.isPending
                    ? "Notifying responders…"
                    : "Notify responder / disaster team"}
                  <Bell size={17} />
                </Button>
              ))}
            {notifyResponders.error && <p className="login-error" role="alert">{notifyResponders.error.message}</p>}
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="modal-backdrop" onClick={() => setReportOpen(false)}>
          <div className="report-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <div>
                <span className="eyebrow">RAPID RESPONSE</span>
                <h2>Report an incident</h2>
              </div>
              <button onClick={() => setReportOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {submitted ? (
              <div className="success-state">
                <div className="success-icon">
                  <ShieldCheck size={28} />
                </div>
                <h3>Report received</h3>
                <p>
                  Your report has been logged and is now visible to the response
                  desk.
                </p>
                <Button onClick={() => setReportOpen(false)}>
                  Return to operations
                </Button>
              </div>
            ) : (
              <div className="report-form">
                <label>
                  What is happening?
                  <Input value={reportType} onChange={e => setReportType(e.target.value)} placeholder="e.g. Flooding on East Service Road" />
                </label>
                <label>
                  Location
                  <Input value={reportLocation} onFocus={() => setReportLocationPickerOpen(true)} onChange={e => setReportLocation(e.target.value)} placeholder="Barangay, street, or landmark" />
                </label>
                {reportLocationPickerOpen && <PaterosLocationPicker latitude={Number(reportLatitude)} longitude={Number(reportLongitude)} onPick={(latitude, longitude) => { setReportLatitude(latitude.toFixed(6)); setReportLongitude(longitude.toFixed(6)); }} />}
                <label>
                  Priority
                  <select value={reportPriority} onChange={e => setReportPriority(e.target.value as typeof reportPriority)}>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </label>
                <label>
                  Additional details
                  <textarea value={reportDescription} onChange={e => setReportDescription(e.target.value)} placeholder="Share any details that can help responders…" />
                </label>
                <label className="file-field">
                  Evidence attachment{" "}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e =>
                      setEvidenceName(e.target.files?.[0]?.name || "")
                    }
                  />
                  {evidenceName && <small>Selected: {evidenceName}</small>}
                </label>
                <div className="modal-actions">
                  <Button
                    variant="outline"
                    onClick={() => setReportOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={submitReport} disabled={createReportMutation.isPending || !reportType.trim() || !reportLocation.trim() || !reportDescription.trim()}>
                    {createReportMutation.isPending ? <LoaderCircle className="login-spinner" size={16} /> : <Siren size={16} />} Submit report
                  </Button>
                </div>
                {createReportMutation.error && <p className="login-error" role="alert">{createReportMutation.error.message}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type DemoAccountRecord = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  demoExpiresAt: Date | null;
  demoRevokedAt: Date | null;
  createdAt: Date;
  lastSignedIn: Date | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
};
type DemoCredential = {
  userId: number;
  email: string;
  password: string;
  role: "admin" | "staff" | "responder" | "citizen";
  expiresAt: Date;
  provisionedBy: number;
};

type DemoAccountsWorkspaceProps = {
  demoAccounts?: DemoAccountRecord[];
  isLoading: boolean;
  error: { message?: string } | null;
  refetch: () => Promise<unknown>;
  revokeId: number | null;
  setRevokeId: (id: number | null) => void;
  revokeMutation: {
    isPending: boolean;
    error: { message?: string } | null;
    mutate: (input: { userId: number }) => void;
  };
};

function WorkspaceView({
  active,
  search,
  centers,
  resources,
  onStaticCentersChange,
  onStaticResourcesChange,
  onOpenIncident,
}: {
  active: string;
  search: string;
  centers?: WorkspaceCenter[];
  resources?: WorkspaceResource[];
  onStaticCentersChange?: (centers: WorkspaceCenter[]) => void;
  onStaticResourcesChange?: (resources: WorkspaceResource[]) => void;
  onOpenIncident?: (incident: IncidentSummary, reportId?: number) => void;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: liveResources } = trpc.operations.resources.useQuery({}, { enabled: active === "Resources" && !isStaticSession() });
  const { data: workspaceAlerts } = trpc.operations.alerts.useQuery(undefined, { enabled: active === "Alerts" && !isStaticSession() });
  const workspaceAlertsForRole = alertsVisibleToRole(workspaceAlerts, user?.role);
  const [staticReports, setStaticReports] = useState<WorkspaceReport[]>(readStaticReports);
  useEffect(() => {
    const refreshReports = () => setStaticReports(readStaticReports());
    window.addEventListener("likas-static-reports-changed", refreshReports);
    return () => window.removeEventListener("likas-static-reports-changed", refreshReports);
  }, []);
  const { data: managedUsers } = trpc.admin.users.useQuery(undefined, {
    enabled: active === "User & roles",
    refetchInterval: active === "User & roles" ? 1000 : false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  const { data: roleChangeRequests } = trpc.admin.roleChangeRequests.useQuery(
    undefined,
    {
      enabled: active === "User & roles",
      refetchInterval: active === "User & roles" ? 1000 : false,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    }
  );
  const {
    data: demoAccounts,
    isLoading: demoAccountsLoading,
    error: demoAccountsError,
    refetch: refetchDemoAccounts,
  } = trpc.admin.demoAccounts.useQuery(undefined, {
    enabled: active === "Demo accounts",
  });
  const { data: roleHistory } = trpc.admin.roleHistory.useQuery(
    {},
    { enabled: active === "User & roles" || active === "Activity log" }
  );
  const { data: invitations } = trpc.admin.invitations.useQuery(undefined, {
    enabled: active === "User & roles",
  });
  const { data: liveReports } = trpc.operations.reports.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 1500,
    refetchOnWindowFocus: true,
  });
  const updateRiskReportMutation = trpc.operations.updateRiskReport.useMutation({
    onSuccess: () => utils.operations.reports.invalidate(),
  });
  const incidentReports = isStaticSession() ? staticReports : liveReports;
  const activeIncidentReports = incidentReports?.filter(report => report.status !== "RESOLVED");
  const assignedToMeCount =
    activeIncidentReports?.filter(report => report.assignedResponderId === user?.id).length ?? 0;
  const claimableCount =
    activeIncidentReports?.filter(report => !report.assignedResponderId).length ?? 0;
  const twoFactorQuery = trpc.security.twoFactorStatus.useQuery(undefined, {
    enabled: active === "Security" && user?.role === "responder" && !isStaticSession(),
  });
  const beginTwoFactorSetupMutation = trpc.security.beginTwoFactorSetup.useMutation({
    onSuccess: () => twoFactorQuery.refetch(),
  });
  const confirmTwoFactorSetupMutation = trpc.security.confirmTwoFactorSetup.useMutation({
    onSuccess: () => twoFactorQuery.refetch(),
  });
  const disableTwoFactorMutation = trpc.security.disableTwoFactor.useMutation({
    onSuccess: () => twoFactorQuery.refetch(),
  });
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorSetup, setTwoFactorSetup] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  function markIncidentDone(reportId: number) {
    if (isStaticSession()) {
      const nextReports = (incidentReports ?? []).map(report =>
        report.id === reportId ? { ...report, status: "RESOLVED" } : report
      );
      window.localStorage.setItem("likas-static-reports", JSON.stringify(nextReports));
      window.dispatchEvent(new Event("likas-static-reports-changed"));
      return;
    }
    updateRiskReportMutation.mutate({ reportId, status: "RESOLVED" });
  }
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "responder">(
    "responder"
  );
  const [inviteCopied, setInviteCopied] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoName, setDemoName] = useState("Training account");
  const [demoRole, setDemoRole] = useState<
    "admin" | "staff" | "responder" | "citizen"
  >("responder");
  const [demoDays, setDemoDays] = useState("7");
  const [allDemoCredentials, setAllDemoCredentials] = useState<
    DemoCredential[]
  >([]);
  const [copiedDemo, setCopiedDemo] = useState(false);
  const [revokeDemoId, setRevokeDemoId] = useState<number | null>(null);
  const [demoFilter, setDemoFilter] = useState<
    "ALL" | "ACTIVE" | "EXPIRED" | "REVOKED"
  >("ALL");
  const [demoSearch, setDemoSearch] = useState("");
  const allowedWorkspaces: Record<string, string[]> = {
    admin: ["Evacuation centers", "Evacuees", "Resources", "Incident map", "Risk reports", "Alerts", "Activity log", "Settings", "User & roles"],
    staff: ["Overview", "Evacuation centers", "Evacuees", "Resources", "Alerts"],
    responder: ["Overview", "Incident map", "Risk reports", "Alerts", "Security"],
  };
  const inviteMutation = trpc.admin.createInvitation.useMutation({
    onSuccess: () => {
      setInviteName("");
      setInviteEmail("");
      setInviteCopied(false);
      utils.admin.invitations.invalidate();
    },
  });
  const demoMutation = trpc.admin.provisionDemoAccount.useMutation({
    onSuccess: () => utils.admin.demoAccounts.invalidate(),
  });
  const allDemoMutation = trpc.admin.provisionDemoAccounts.useMutation({
    onSuccess: result => {
      setAllDemoCredentials(result);
      utils.admin.demoAccounts.invalidate();
    },
  });
  const revokeDemoMutation = trpc.admin.revokeDemoAccount.useMutation({
    onSuccess: () => {
      setRevokeDemoId(null);
      utils.admin.demoAccounts.invalidate();
    },
  });
  const [roleCredential, setRoleCredential] = useState("");
  const [roleFlowError, setRoleFlowError] = useState("");
  const [rolePrompt, setRolePrompt] = useState<{
    userId: number;
    name: string;
    email: string;
    currentRole: string;
    nextRole: string;
  } | null>(null);
  const requestRoleChangeMutation = trpc.admin.requestRoleChange.useMutation({
    onSuccess: result => {
      setRoleCredential("");
      setRolePrompt(null);
      setRoleFlowError("");
      utils.admin.users.invalidate();
      utils.admin.roleChangeRequests.invalidate();
      if (result.outcome === "approval") {
        toast("Role change request sent. Another administrator must approve it.");
      } else {
        toast(`Role updated to ${formatRoleLabel(result.role)}.`);
      }
    },
    onError: error => setRoleFlowError(error.message),
  });
  const approveRoleChangeMutation = trpc.admin.approveRoleChange.useMutation({
    onSuccess: () => {
      setRoleFlowError("");
      utils.admin.users.invalidate();
      utils.admin.roleChangeRequests.invalidate();
      toast("Request approved and role applied.");
    },
    onError: error => setRoleFlowError(error.message),
  });
  const rejectRoleChangeMutation = trpc.admin.rejectRoleChange.useMutation({
    onSuccess: () => {
      setRoleFlowError("");
      utils.admin.users.invalidate();
      utils.admin.roleChangeRequests.invalidate();
      toast("Request declined.");
    },
    onError: error => setRoleFlowError(error.message),
  });
  const [approvalError, setApprovalError] = useState("");
  const approvalMutation = trpc.admin.updateUserApproval.useMutation({
    onSuccess: () => {
      setApprovalError("");
      utils.admin.users.invalidate();
    },
    onError: error => setApprovalError(error.message),
  });
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordName, setRecordName] = useState("");
  const [recordCategory, setRecordCategory] = useState("");
  const [recordUnit, setRecordUnit] = useState("");
  const [recordQuantity, setRecordQuantity] = useState("0");
  const [recordMinimumStock, setRecordMinimumStock] = useState("0");
  const [recordCenterId, setRecordCenterId] = useState("");
  const [recordEmail, setRecordEmail] = useState("");
  const [recordLatitude, setRecordLatitude] = useState("14.544000");
  const [recordLongitude, setRecordLongitude] = useState("121.071000");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [recordAge, setRecordAge] = useState("");
  const [recordSex, setRecordSex] = useState<"FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED">("UNSPECIFIED");
  const [recordError, setRecordError] = useState("");
  const createCenterMutation = trpc.admin.createCenter.useMutation({ onSuccess: () => { setRecordOpen(false); utils.operations.centers.invalidate(); } });
  const [editingCenter, setEditingCenter] = useState<{ id: number; name: string; currentOccupancy: number; maximumCapacity: number } | null>(null);
  const [editCenterName, setEditCenterName] = useState("");
  const [editOccupancy, setEditOccupancy] = useState("");
  const [editError, setEditError] = useState("");
  const updateCenterMutation = trpc.admin.updateCenter.useMutation({ onSuccess: () => { setEditingCenter(null); setEditError(""); utils.operations.centers.invalidate(); } });
  const archiveCenterMutation = trpc.admin.archiveCenter.useMutation({ onSuccess: () => utils.operations.centers.invalidate() });
  const createResourceMutation = trpc.admin.createResource.useMutation({ onSuccess: () => { setRecordOpen(false); utils.operations.resources.invalidate(); } });
  const [editingResource, setEditingResource] = useState<WorkspaceResource | null>(null);
  const [editResourceQuantity, setEditResourceQuantity] = useState("");
  const [editResourceMinimum, setEditResourceMinimum] = useState("");
  const [resourceError, setResourceError] = useState("");
  const updateResourceMutation = trpc.admin.updateResource.useMutation({ onSuccess: () => { setEditingResource(null); utils.operations.resources.invalidate(); } });
  const removeResourceMutation = trpc.admin.removeResource.useMutation({ onSuccess: () => utils.operations.resources.invalidate() });
  const registerEvacueeMutation = trpc.operations.registerEvacuee.useMutation({ onSuccess: () => { setRecordOpen(false); } });
  const [alertForm, setAlertForm] = useState({ title: "", message: "", alertType: "GENERAL_UPDATE", priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", targetAudience: "ALL_USERS" as "ALL_USERS" | "CITIZENS" | "STAFF" | "RESPONDERS" | "ADMIN" });
  const createAlertMutation = trpc.admin.createAlert.useMutation({ onSuccess: () => { setRecordOpen(false); utils.operations.alerts.invalidate(); } });
  function submitAlert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createAlertMutation.mutate({ title: alertForm.title, message: alertForm.message, alertType: alertForm.alertType, priority: alertForm.priority, targetAudience: alertForm.targetAudience });
  }
  const canAddRecord = (user?.role === "admin" && (active === "Evacuation centers" || active === "Resources")) || ((user?.role === "staff") && (active === "Evacuation centers" || active === "Evacuees" || active === "Resources"));
  const recordTitle = active === "Evacuation centers" ? "Add evacuation center" : active === "Resources" ? "Add resource" : "Register evacuee";
  function closeRecordForm() {
    setRecordOpen(false);
    setRecordError("");
    createCenterMutation.reset();
    createResourceMutation.reset();
    registerEvacueeMutation.reset();
    setLocationPickerOpen(false);
  }
  function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecordError("");
    if (active === "Resources") {
      if (!recordCenterId) return setRecordError("Select an evacuation center.");
      if (isStaticSession()) {
        const quantity = Number(recordQuantity);
        const minimumStock = Number(recordMinimumStock);
        const nextResources = [...(resources ?? []), { id: -Date.now(), name: recordName, category: "General", quantity, unit: recordUnit, minimumStock, centerId: Number(recordCenterId), status: quantity <= 0 ? "OUT_OF_STOCK" : quantity <= minimumStock ? "LOW_STOCK" : "AVAILABLE" }];
        writeStaticResources(nextResources);
        onStaticResourcesChange?.(nextResources);
        setRecordOpen(false);
        return;
      }
      createResourceMutation.mutate({ name: recordName, category: "General", quantity: Number(recordQuantity), unit: recordUnit, minimumStock: Number(recordMinimumStock), centerId: Number(recordCenterId) });
    } else if (active === "Evacuees") {
      if (!recordCenterId) return setRecordError("Select an evacuation center.");
      registerEvacueeMutation.mutate({ firstName: recordName, lastName: recordCategory, age: Number(recordAge), sex: recordSex, centerId: Number(recordCenterId) });
    } else {
      if (isStaticSession()) {
        const nextCenters = [...(centers ?? []), { id: -Date.now(), name: recordName, address: recordCategory, barangay: recordUnit, currentOccupancy: 0, maximumCapacity: Number(recordQuantity), status: "OPEN", latitude: recordLatitude, longitude: recordLongitude }];
        writeStaticCenters(nextCenters);
        onStaticCentersChange?.(nextCenters);
        setRecordOpen(false);
        return;
      }
      createCenterMutation.mutate({ centerCode: recordEmail, name: recordName, address: recordCategory, barangay: recordUnit, latitude: recordLatitude, longitude: recordLongitude, maximumCapacity: Number(recordQuantity), currentOccupancy: 0, status: "OPEN" });
    }
  }
  if (active === "Overview") return null;
  const data: Record<
    string,
    {
      eyebrow: string;
      title: string;
      description: string;
      columns: string[];
      rows: string[][];
    }
  > = {
    "Evacuation centers": {
      eyebrow: "CENTER NETWORK",
      title: "Evacuation centers",
      description:
        "Capacity, staffing, and operating status across the Pateros network.",
      columns: ["Center", "Occupancy", "Availability", "Status"],
      rows: [
        ["Rizal Tolentino Center", "82 / 120", "38 slots", "OPEN"],
        ["Pateros Elementary School", "111 / 120", "9 slots", "NEAR FULL"],
        ["M. L. Quezon Center", "48 / 80", "32 slots", "OPEN"],
        ["Sta. Ana Gymnasium", "96 / 150", "54 slots", "OPEN"],
      ],
    },
    Evacuees: {
      eyebrow: "PEOPLE REGISTRY",
      title: "Evacuee registry",
      description:
        "Search, transfer, and release residents while keeping center occupancy synchronized.",
      columns: ["Evacuee", "Center", "Registered", "Status"],
      rows: [
        ["Maria L. Santos", "Rizal Tolentino", "Today · 13:54", "ACTIVE"],
        ["Joel D. Ramos", "Pateros Elementary", "Today · 12:47", "ACTIVE"],
        ["Lina G. Cruz", "Sta. Ana Gym", "Yesterday", "TRANSFERRED"],
        ["Carlos M. Reyes", "M. L. Quezon", "Yesterday", "ACTIVE"],
      ],
    },
    Resources: {
      eyebrow: "SUPPLY CHAIN",
      title: "Resource inventory",
      description:
        "Monitor stock levels, expiry windows, and movement between centers.",
      columns: ["Resource", "Stock", "Status"],
      rows: [
        ["Drinking water", "Rizal Tolentino", "500 L", "AVAILABLE"],
        ["Hygiene kits", "Pateros Elementary", "42 kits", "LOW STOCK"],
        ["Paracetamol", "Sta. Ana Gym", "18 boxes", "AVAILABLE"],
        ["Blankets", "M. L. Quezon", "0 units", "OUT OF STOCK"],
      ],
    },
    "Incident map": {
      eyebrow: "GEO OPERATIONS",
      title: "Incident map",
      description:
        "Geolocated reports, responder activity, and center availability in one view.",
      columns: ["Reference", "Type", "Location", "Priority"],
      rows: [
        ["RPT-2408", "Flooding", "Brgy. Sta. Ana", "CRITICAL"],
        ["RPT-2407", "Road blockage", "B. Morcilla St.", "HIGH"],
        ["RPT-2406", "Power outage", "Brgy. San Roque", "MEDIUM"],
      ],
    },
    "Risk reports": {
      eyebrow: "REPORTS DESK",
      title: "Risk reports",
      description:
        "Triage citizen reports and route verified incidents to response teams.",
      columns: ["Reference", "Report", "Location", "Workflow"],
      rows: [
        ["RPT-2408", "Flooding", "12 min ago", "IN PROGRESS"],
        ["RPT-2407", "Road blockage", "38 min ago", "ASSIGNED"],
        ["RPT-2406", "Power outage", "1 hr ago", "PENDING"],
      ],
    },
    Alerts: {
      eyebrow: "BROADCAST CONTROL",
      title: "Alert center",
      description:
        "Target audiences, urgency, and fallback delivery status for each operational alert.",
      columns: ["Alert", "Audience", "Priority", "Status"],
      rows: [
        ["Flood warning · Sta. Ana", "ALL USERS", "CRITICAL", "IN-APP · SENT"],
        ["Water stock replenished", "STAFF", "MEDIUM", "IN-APP · SENT"],
        ["Team Alpha en route", "RESPONDERS", "HIGH", "IN-APP · SENT"],
      ],
    },
    "Activity log": {
      eyebrow: "AUDIT TRAIL",
      title: "Activity log",
      description:
        "A chronological record of verified changes made in the system.",
      columns: ["Time", "Actor", "Action", "Entity"],
      rows: [],
    },
    Settings: {
      eyebrow: "SYSTEM CONTROL",
      title: "Settings",
      description:
        "Provider configuration, notification channels, backups, and operations preferences.",
      columns: ["Setting", "Current value", "Scope", "State"],
      rows: [
        ["Weather provider", "Not configured", "Operations", "FALLBACK"],
        ["Email notifications", "In-app fallback", "Alerts", "READY"],
        ["SMS gateway", "Not configured", "Alerts", "OPTIONAL"],
        ["Database backup", "On-demand export", "Governance", "READY"],
        ["Restore workflow", "Admin approval", "Governance", "PROTECTED"],
      ],
    },
    "User & roles": {
      eyebrow: "IDENTITY CONTROL",
      title: "User & Role Management",
      description:
        "Assign least-privilege access, center responsibilities, and review every role change.",
      columns: ["User", "Email", "Role", "Last sign-in"],
      rows: [
        [
          "Operations lead",
          "admin@likas.local",
          "Administrator",
          "Today · 14:32",
        ],
        ["Maria Santos", "maria@likas.local", "Citizen", "Today · 13:54"],
        [
          "Team Alpha",
          "alpha@likas.local",
          "Responder / Disaster Team",
          "Today · 13:21",
        ],
      ],
    },
    "Demo accounts": {
      eyebrow: "TRAINING CONTROL",
      title: "Demo account dashboard",
      description:
        "Monitor temporary training accounts, review expiry windows, and revoke access immediately when a drill ends.",
      columns: [],
      rows: [],
    },
  };
  const view = data[active] ?? data.Overview;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleCenterRows = (user?.role === "staff" ? centers?.filter(center => center.status !== "CLOSED") : centers)?.filter(center => !normalizedSearch || `${center.name} ${center.address} ${center.barangay} ${center.status}`.toLowerCase().includes(normalizedSearch));
  const visibleResourceRows = (resources ?? liveResources ?? []).filter(resource => !normalizedSearch || `${resource.name} ${resource.category} ${resource.status} ${resource.unit}`.toLowerCase().includes(normalizedSearch));
  const filteredLiveReports = liveReports?.filter(report => !normalizedSearch || `${report.reportCode} ${report.reportType} ${report.location} ${report.status} ${report.priority}`.toLowerCase().includes(normalizedSearch));
  const alertAudienceLabels: Record<string, string> = {
    ALL_USERS: "All users",
    CITIZENS: "Citizens",
    STAFF: "Staff",
    RESPONDERS: "Responders",
    ADMIN: "Admins only",
  };
  const alertMessages = active === "Alerts" && workspaceAlerts !== undefined
    ? workspaceAlertsForRole.map(alert => ({ alertType: alert.alertType, message: alert.message }))
    : [];
  const workspaceRows = active === "Evacuation centers" && centers !== undefined
    ? visibleCenterRows!.map(center => [
        center.name,
        `${center.currentOccupancy} / ${center.maximumCapacity}`,
        `${Math.max(0, center.maximumCapacity - center.currentOccupancy)} slots`,
        center.status,
      ])
    : active === "Resources" && (resources !== undefined || liveResources !== undefined)
      ? visibleResourceRows.map(resource => [resource.name, `${resource.quantity} ${resource.unit}`, resource.status])
    : active === "Risk reports" && liveReports !== undefined
      ? (filteredLiveReports ?? []).map(report => [report.reportCode, report.reportType, report.location, report.status])
      : active === "Alerts" && workspaceAlerts !== undefined
        ? workspaceAlertsForRole.map(alert => [alert.title, alertAudienceLabels[alert.targetAudience] ?? alert.targetAudience, alert.priority, alert.isActive ? "ACTIVE" : "ENDED"])
      : view.rows.filter(row => !normalizedSearch || row.some(cell => cell.toLowerCase().includes(normalizedSearch)));
  const tableColumns = active === "Evacuation centers" || active === "Resources" ? [...view.columns, "Actions"] : view.columns;
  const reportDestinations = active === "Risk reports" && liveReports !== undefined
    ? (filteredLiveReports ?? []).map(report => report.latitude && report.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(report.location)}`)
    : [];
  function exportView() {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [view.columns, ...workspaceRows]
      .map(row => row.map(escapeCsv).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${active.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (active !== "Overview" && !allowedWorkspaces[user?.role || ""]?.includes(active))
    return (
      <section className="workspace-view panel">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">ACCESS</span>
            <h2>{active}</h2>
            <p>
              This workspace isn't available for your role. Ask an
              administrator if you need access.
            </p>
          </div>
        </div>
      </section>
    );
  if (active === "Activity log")
    return (
      <section className="workspace-view panel">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">AUDIT TRAIL</span>
            <h2>Activity log</h2>
            <p>Verified changes recorded across the system.</p>
          </div>
        </div>
        <div className="workspace-table-wrap">
          <table className="workspace-table workspace-user-table">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Module</th><th>Record</th></tr></thead>
            <tbody>
              {roleHistory?.map(entry => (
                <tr key={entry.id}>
                  <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td>{entry.actorId ? `User #${entry.actorId}` : "System"}</td>
                  <td>{entry.action}</td>
                  <td>{entry.entityType}</td>
                  <td>{entry.entityId ? `#${entry.entityId}` : "-"}</td>
                </tr>
              ))}
              {!roleHistory?.length && <tr><td colSpan={5}><span className="empty-copy">No activity has been recorded yet.</span></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="workspace-note"><ShieldCheck size={15} /> Only audit activity is shown in this workspace.</div>
      </section>
    );
  if (active === "Demo accounts")
    return (
      <DemoAccountsWorkspace
        demoAccounts={demoAccounts}
        isLoading={demoAccountsLoading}
        error={demoAccountsError}
        refetch={refetchDemoAccounts}
        revokeId={revokeDemoId}
        setRevokeId={setRevokeDemoId}
        revokeMutation={revokeDemoMutation}
      />
    );
  if (active === "Settings")
    return (
      <section className="workspace-view panel">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">{view.eyebrow}</span>
            <h2>{view.title}</h2>
            <p>{view.description}</p>
          </div>
        </div>
        <div className="settings-sections">
          <section className="settings-section">
            <div className="settings-section-heading">
              <div><h3>General</h3><p>Basic information about this emergency coordination workspace.</p></div>
              <Badge variant="outline">System</Badge>
            </div>
            <div className="settings-list">
              <div className="settings-row"><div><strong>Workspace name</strong><span>Shown to administrators and operations teams.</span></div><strong>Project Likas</strong></div>
              <div className="settings-row"><div><strong>Operating area</strong><span>Location used for centers, alerts, and weather.</span></div><strong>Pateros, Metro Manila</strong></div>
              <div className="settings-row"><div><strong>Weather provider</strong><span>Live weather falls back to in-app conditions when unavailable.</span></div><Badge>In-app fallback</Badge></div>
            </div>
          </section>
        </div>
        <div className="workspace-note">
          <ShieldCheck size={15} /> Settings changes are permissioned, logged,
          and synchronized with the operations database.
        </div>
      </section>
    );
  if (active === "User & roles") {
    const users = managedUsers?.length
      ? managedUsers
      : view.rows.map((row, index) => ({
          id: index + 1,
          name: row[0],
          email: row[1],
          role: row[2].toLowerCase().includes("administrator")
            ? "admin"
            : (row[2].toLowerCase() as "citizen" | "responder"),
          accountStatus: "APPROVED" as const,
          lastSignedIn: new Date(),
        }));
    return (
      <section className="workspace-view panel">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">{view.eyebrow}</span>
            <h2>{view.title}</h2>
            <p>{view.description}</p>
          </div>
          <div className="workspace-actions">
            <Button onClick={() => setInviteOpen(value => !value)}>
              <UserCog size={15} /> Invite user
            </Button>
          </div>
        </div>
        <div className="workspace-table-wrap">
          <div className="workspace-note">
            <ShieldCheck size={15} /> {users.filter(managedUser => managedUser.accountStatus === "PENDING" && managedUser.role === "citizen").length} citizen application{users.filter(managedUser => managedUser.accountStatus === "PENDING" && managedUser.role === "citizen").length === 1 ? "" : "s"} waiting for approval. This list refreshes automatically.
          </div>
          {approvalError && <div className="login-error" role="alert">{approvalError}</div>}
          <table className="workspace-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Exact role</th>
                <th>Account status</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map(managedUser => (
                <tr key={managedUser.id}>
                    <td className="workspace-user-cell" data-label="User">
                    <strong>{managedUser.name || "Unnamed user"}</strong>
                  </td>
                  <td data-label="Email">{managedUser.email || "—"}</td>
                  <td className="workspace-role-cell" data-label="Exact role">
                    <select
                      className="role-select"
                      value={managedUser.role}
                      disabled={managedUser.id === user?.id}
                      title={
                        managedUser.id === user?.id
                          ? "Ask another administrator to change your own role"
                          : undefined
                      }
                      onChange={event => {
                        const nextRole = event.target.value as
                          | "admin"
                          | "staff"
                          | "responder"
                          | "citizen"
                          | "user";
                        if (nextRole === managedUser.role) return;
                        setRoleFlowError("");
                        setRoleCredential("");
                        setRolePrompt({
                          userId: managedUser.id,
                          name: managedUser.name || "This user",
                          email: managedUser.email || "",
                          currentRole: managedUser.role,
                          nextRole,
                        });
                      }}
                    >
                      <option value="admin">Administrator</option>
                      <option value="staff">Evacuation Center Staff</option>
                      <option value="responder">
                        Responder / Disaster Team
                      </option>
                      <option value="citizen">Citizen</option>
                      <option value="user">Citizen (legacy)</option>
                    </select>
                    {roleChangeRequests?.some(
                      request =>
                        request.userId === managedUser.id &&
                        request.status === "PENDING"
                    ) && (
                      <Badge variant="outline" className="role-pending-chip">
                        Change pending approval
                      </Badge>
                    )}
                  </td>
                  <td className="workspace-approval-cell" data-label="Account status">
                    <div className="workspace-approval-controls">
                      {managedUser.accountStatus === "PENDING" ? <>
                        <Badge variant="outline">Pending approval</Badge>
                        <Button size="sm" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ userId: managedUser.id, accountStatus: "APPROVED" })}>Approve</Button>
                        <Button size="sm" variant="outline" disabled={approvalMutation.isPending} onClick={() => approvalMutation.mutate({ userId: managedUser.id, accountStatus: "REJECTED" })}>Decline</Button>
                      </> : <Badge variant="outline">{managedUser.accountStatus ?? "APPROVED"}</Badge>}
                    </div>
                  </td>
                  <td data-label="Last sign-in">
                    {managedUser.lastSignedIn
                      ? new Date(managedUser.lastSignedIn).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {roleChangeRequests?.some(request => request.status === "PENDING") && (
            <div className="role-request-panel">
              <div className="role-request-head">
                <span className="eyebrow">ROLE APPROVAL QUEUE</span>
                <h3>Awaiting administrator approval</h3>
              </div>
              {roleFlowError && (
                <div className="login-error" role="alert">{roleFlowError}</div>
              )}
              {roleChangeRequests
                .filter(request => request.status === "PENDING")
                .map(request => (
                  <div className="role-request-row" key={request.id}>
                    <div className="role-request-copy">
                      <strong>
                        {request.userName} → {formatRoleLabel(request.toRole)}
                      </strong>
                      <small>
                        Requested by{" "}
                        {request.requesterId === user?.id
                          ? "you"
                          : request.requesterName}{" "}
                        · expires {new Date(request.expiresAt).toLocaleString()}
                      </small>
                    </div>
                    {request.requesterId === user?.id ? (
                      <span className="role-request-waiting">
                        Waiting for another administrator
                      </span>
                    ) : (
                      <div className="role-request-actions">
                        <Button
                          size="sm"
                          disabled={
                            approveRoleChangeMutation.isPending ||
                            rejectRoleChangeMutation.isPending
                          }
                          onClick={() =>
                            approveRoleChangeMutation.mutate({
                              requestId: request.id,
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            approveRoleChangeMutation.isPending ||
                            rejectRoleChangeMutation.isPending
                          }
                          onClick={() =>
                            rejectRoleChangeMutation.mutate({
                              requestId: request.id,
                            })
                          }
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
        {inviteOpen && (
          <div className="invite-panel">
            <div>
              <span className="eyebrow">PROVISION ACCESS</span>
              <h3>Invite a response team member</h3>
              <p>
                Invitations expire after 7 days and can create Center staff or
                Responder access.
              </p>
            </div>
            <div className="invite-fields">
              <Input
                value={inviteName}
                onChange={event => setInviteName(event.target.value)}
                placeholder="Full name"
                aria-label="Invitee name"
              />
              <Input
                type="email"
                value={inviteEmail}
                onChange={event => setInviteEmail(event.target.value)}
                placeholder="Email address"
                aria-label="Invitee email"
              />
              <select
                value={inviteRole}
                onChange={event =>
                  setInviteRole(event.target.value as typeof inviteRole)
                }
                aria-label="Invitation role"
              >
                <option value="responder">Responder / Disaster Team</option>
                <option value="staff">Evacuation Center Staff</option>
              </select>
              <Button
                disabled={
                  !inviteName.trim() ||
                  !inviteEmail.trim() ||
                  inviteMutation.isPending
                }
                onClick={() =>
                  inviteMutation.mutate({
                    name: inviteName,
                    email: inviteEmail,
                    role: inviteRole,
                  })
                }
              >
                {inviteMutation.isPending ? "Creating…" : "Create invitation"}
              </Button>
            </div>
            {inviteMutation.data && (
              <div className="invite-result">
                {inviteMutation.data.emailSent ? (
                  <p
                    className="invite-sent"
                    role="status"
                    style={{ color: "#168a70", marginBottom: 8 }}
                  >
                    ☑ Invitation sent to {inviteMutation.data.email} — they set
                    their password using the emailed link.
                  </p>
                ) : (
                  <p className="login-error" role="alert">
                    Invitation created, but the email could not be sent:{" "}
                    {inviteMutation.data.emailError ?? "unknown error"}
                  </p>
                )}
                <p className="invite-token">
                  One-time link (expires in 7 days):{" "}
                  <code style={{ wordBreak: "break-all" }}>
                    {inviteMutation.data.inviteUrl}
                  </code>
                </p>
                <div className="invite-actions" style={{ marginTop: 8 }}>
                  <Button
                    size="sm"
                    onClick={() => {
                      const link = inviteMutation.data!.inviteUrl;
                      if (navigator.clipboard) {
                        void navigator.clipboard.writeText(link);
                      }
                      setInviteCopied(true);
                    }}
                  >
                    {inviteCopied ? "Copied!" : "Copy invite link"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInviteOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
            {inviteMutation.error && (
              <p className="login-error" role="alert">
                {inviteMutation.error.message}
              </p>
            )}
          </div>
        )}
        {demoOpen && (
          <div className="invite-panel demo-panel">
            <div>
              <span className="eyebrow">TRAINING ACCESS</span>
              <h3>Create a role-based demo account</h3>
              <p>
                Use temporary credentials for drills and onboarding. Demo
                accounts expire automatically and cannot replace real
                operational accounts.
              </p>
            </div>
            <div className="invite-fields demo-fields">
              <Input
                value={demoName}
                onChange={event => setDemoName(event.target.value)}
                placeholder="Training account name"
                aria-label="Demo account name"
              />
              <select
                value={demoRole}
                onChange={event =>
                  setDemoRole(event.target.value as typeof demoRole)
                }
                aria-label="Demo account role"
              >
                <option value="admin">Administrator</option>
                <option value="staff">Evacuation Center Staff</option>
                <option value="responder">Responder / Disaster Team</option>
                <option value="citizen">Citizen</option>
              </select>
              <select
                value={demoDays}
                onChange={event => setDemoDays(event.target.value)}
                aria-label="Demo account expiry"
              >
                <option value="1">Expires in 1 day</option>
                <option value="7">Expires in 7 days</option>
                <option value="14">Expires in 14 days</option>
                <option value="30">Expires in 30 days</option>
              </select>
              <Button
                disabled={!demoName.trim() || demoMutation.isPending}
                onClick={() =>
                  demoMutation.mutate({
                    name: demoName,
                    role: demoRole,
                    expiresInDays: Number(demoDays),
                  })
                }
              >
                {demoMutation.isPending ? "Provisioning…" : "Provision demo"}
              </Button>
            </div>
            <div className="demo-all-actions">
              <Button
                variant="outline"
                disabled={allDemoMutation.isPending}
                onClick={() => allDemoMutation.mutate({ expiresInDays: Number(demoDays) })}
              >
                <KeyRound size={15} />
                {allDemoMutation.isPending ? "Creating role demos…" : "Create demo for all roles"}
              </Button>
              <small>Creates temporary Admin, Staff, Responder, and Citizen accounts for this training session.</small>
            </div>
            {allDemoCredentials.length > 0 && (
              <div className="demo-credentials demo-credentials-grid" role="status">
                <strong>Role demo credentials — copy once</strong>
                {allDemoCredentials.map(credential => (
                  <span key={credential.userId}>
                    <b>{formatRoleLabel(credential.role)}</b> {credential.email} / {credential.password}
                  </span>
                ))}
                <small>All accounts expire {new Date(allDemoCredentials[0].expiresAt).toLocaleString()}.</small>
                <Button
                  variant="outline"
                  onClick={() => navigator.clipboard?.writeText(allDemoCredentials.map(credential => `${formatRoleLabel(credential.role)}\nEmail: ${credential.email}\nPassword: ${credential.password}`).join("\n\n"))}
                >
                  <Copy size={15} /> Copy all credentials
                </Button>
              </div>
            )}
            {allDemoMutation.error && (
              <p className="login-error" role="alert">{allDemoMutation.error.message}</p>
            )}
            {demoMutation.data && (
              <div className="demo-credentials" role="status">
                <strong>Demo credentials — copy once</strong>
                <span>
                  <b>Email</b> {demoMutation.data.email}
                </span>
                <span>
                  <b>Password</b> {demoMutation.data.password}
                </span>
                <small>
                  Role: {formatRoleLabel(demoMutation.data.role)} · Expires{" "}
                  {new Date(demoMutation.data.expiresAt).toLocaleString()}
                </small>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      `Email: ${demoMutation.data.email}\nPassword: ${demoMutation.data.password}`
                    );
                    setCopiedDemo(true);
                    window.setTimeout(() => setCopiedDemo(false), 2000);
                  }}
                >
                  <Copy size={15} />{" "}
                  {copiedDemo ? "Copied" : "Copy credentials"}
                </Button>
              </div>
            )}
            {demoMutation.error && (
              <p className="login-error" role="alert">
                {demoMutation.error.message}
              </p>
            )}
          </div>
        )}
        <div className="invitation-list">
          <div>
            <span className="eyebrow">INVITATION QUEUE</span>
            <h3>Recent invitations</h3>
          </div>
          {invitations?.slice(0, 3).map(invitation => (
            <div className="audit-row" key={invitation.id}>
              <UserCog size={15} />
              <span>
                <strong>
                  {invitation.email} · {formatRoleLabel(invitation.role)}
                </strong>
                <small>
                  {invitation.acceptedAt
                    ? "Accepted"
                    : `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="role-audit">
          <div>
            <span className="eyebrow">AUDIT HISTORY</span>
            <h3>Recent access changes</h3>
          </div>
          {(
            roleHistory
              ?.filter(entry => entry.action === "ROLE_CHANGED")
              .slice(0, 4) ?? []
          ).map(entry => (
            <div className="audit-row" key={entry.id}>
              <ShieldCheck size={15} />
              <span>
                <strong>{entry.action.replace("_", " ")}</strong>
                <small>
                  {entry.entityType} #{entry.entityId} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </small>
              </span>
            </div>
          ))}
          {!roleHistory?.some(entry => entry.action === "ROLE_CHANGED") && (
            <p className="empty-copy">
              Role changes will appear here with the administrator, time, and
              affected user.
            </p>
          )}
        </div>
        {rolePrompt && (
          <div className="modal-backdrop" onClick={() => setRolePrompt(null)}>
            <form className="report-modal" onClick={event => event.stopPropagation()} onSubmit={event => {
              event.preventDefault();
              requestRoleChangeMutation.mutate({
                userId: rolePrompt.userId,
                role: rolePrompt.nextRole as "admin" | "staff" | "responder" | "citizen" | "user",
                password: roleCredential,
              });
            }}>
              <div className="modal-title"><div><span className="eyebrow">ROLE CHANGE PROTECTION</span><h2>Change {rolePrompt.name}'s role</h2></div><button type="button" onClick={() => setRolePrompt(null)}><X size={18} /></button></div>
              <p className="modal-copy">
                {rolePrompt.currentRole === "admin" || rolePrompt.nextRole === "admin"
                  ? "Promotions to or from Administrator go through the role approval flow. If another administrator exists, this change is sent for their approval and only takes effect once they approve it."
                  : "This role change is applied immediately, but you must confirm with your password first."}
              </p>
              <div className="role-change-before-after">
                <Badge variant="outline">{formatRoleLabel(rolePrompt.currentRole)}</Badge>
                <span aria-hidden="true">→</span>
                <Badge>{formatRoleLabel(rolePrompt.nextRole)}</Badge>
              </div>
              <label>Confirm with your password<Input type="password" autoComplete="current-password" value={roleCredential} onChange={event => setRoleCredential(event.target.value)} placeholder="Your administrator password" required /></label>
              {(roleFlowError || requestRoleChangeMutation.error) && <p className="login-error" role="alert">{roleFlowError || requestRoleChangeMutation.error?.message}</p>}
              <div className="modal-actions"><Button type="button" variant="outline" onClick={() => setRolePrompt(null)}>Cancel</Button><Button type="submit" disabled={requestRoleChangeMutation.isPending || !roleCredential}>{requestRoleChangeMutation.isPending ? "Authorizing…" : "Authorize change"}</Button></div>
            </form>
          </div>
        )}
      </section>
    );
  }
  if (active === "Incident map")
    return (
      <section className="workspace-view panel responder-incident-map">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">GEO OPERATIONS</span>
            <h2>Incident map</h2>
            <p>Live incident locations and the operational response queue.</p>
          </div>
          {user?.role === "responder" && (
            <div className="incident-meta">
              <span className="incident-meta-item">
                <b>{(activeIncidentReports ?? []).length}</b> active
              </span>
              <span className="incident-meta-item">
                <b>{assignedToMeCount}</b> assigned to you
              </span>
              <span className="incident-meta-item">
                <b>{claimableCount}</b> unassigned · claimable
              </span>
            </div>
          )}
        </div>
        <div className="responder-map-layout">
          <div className="responder-map-frame">
            <MapContainer center={[14.544, 121.071]} zoom={14} minZoom={13} maxZoom={18} maxBounds={[[14.53, 121.05], [14.56, 121.09]]} maxBoundsViscosity={1} scrollWheelZoom className="responder-map">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapZoomReset />
              {(activeIncidentReports ?? []).filter(report => report.latitude != null && report.longitude != null).map(report => (
                <CircleMarker key={report.id} center={[Number(report.latitude), Number(report.longitude)]} radius={11} pathOptions={{ color: "#a63f38", fillColor: "#ef8b82", fillOpacity: 0.95 }}>
                  <Popup>
                    <strong>{report.reportCode} · {report.reportType}</strong><br />
                    {report.location}<br />
                    {report.priority} · {report.status}<br />
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} target="_blank" rel="noreferrer">Go there</a>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <div className="responder-incident-list">
            {(activeIncidentReports ?? []).map(report => (
                  <article className="responder-incident-item" key={report.id}>
                <div><strong>{report.reportCode}</strong><span>{report.reportType}</span></div>
                <p>{report.location}</p>
                <button type="button" className="incident-timeline-button" onClick={() => onOpenIncident?.({ id: report.reportCode, type: report.reportType, location: report.location, priority: report.priority, time: "Live report", color: report.priority === "CRITICAL" ? "rose" : report.priority === "HIGH" ? "amber" : "blue", reportId: report.id, status: report.status, createdAt: report.createdAt, resolution: report.resolution, assignedResponderId: report.assignedResponderId ?? null }, report.id)}>View incident timeline <ChevronRight size={14} /></button>
                <div className="responder-incident-actions">
                  {report.latitude != null && report.longitude != null ? <a href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Go there</a> : <small>Exact coordinates are not available for this report.</small>}
                  {report.status === "RESOLVED" ? <small><CheckCircle2 size={14} /> Done</small> : (user?.role === "responder" || user?.role === "admin") && canTransitionReport(report.status as ReportStatus, "RESOLVED") && <Button type="button" variant="outline" onClick={() => markIncidentDone(report.id)} disabled={updateRiskReportMutation.isPending}><CheckCircle2 size={14} /> Mark done</Button>}
                </div>
              </article>
            ))}
            {!activeIncidentReports?.length && (
              <p className="empty-copy">
                No active incidents right now. New reports from citizens will
                appear here in real time.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  if (active === "Security") {
    const status = twoFactorQuery.data;
    return (
      <section className="workspace-view panel">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">ACCOUNT SECURITY</span>
            <h2>Two-factor authentication</h2>
            <p>
              Protect your responder account with a time-based one-time code.
            </p>
          </div>
        </div>
        <div className="security-2fa">
          {status?.enabled ? (
            <div className="security-card">
              <div className="security-card-head">
                <ShieldCheck size={18} />
                <strong>Two-factor authentication is on</strong>
              </div>
              <p>
                Your account requires a verification code from your
                authenticator app when you sign in.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => disableTwoFactorMutation.mutate()}
                disabled={disableTwoFactorMutation.isPending}
              >
                {disableTwoFactorMutation.isPending ? "Disabling…" : "Disable 2FA"}
              </Button>
              {disableTwoFactorMutation.error && (
                <p className="login-error" role="alert">
                  {disableTwoFactorMutation.error.message}
                </p>
              )}
            </div>
          ) : twoFactorSetup ? (
            <div className="security-card">
              <div className="security-card-head">
                <ShieldCheck size={18} />
                <strong>Add this account to your authenticator app</strong>
              </div>
              <p>
                Open Google Authenticator, 1Password, or another authenticator
                app and add this secret, then enter the 6-digit code it shows to
                confirm.
              </p>
              <div className="security-secret">
                <code>{twoFactorSetup.secret}</code>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    navigator.clipboard?.writeText(twoFactorSetup.secret)
                  }
                >
                  Copy
                </button>
              </div>
              <p className="security-hint">
                Or open directly in your authenticator:{" "}
                <a
                  href={twoFactorSetup.otpauthUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  otpauth link
                </a>
              </p>
              <div className="security-code-row">
                <Input
                  value={twoFactorCode}
                  onChange={e =>
                    setTwoFactorCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  placeholder="6-digit code"
                  inputMode="numeric"
                  maxLength={6}
                  aria-label="Verification code"
                />
                <Button
                  type="button"
                  onClick={() =>
                    confirmTwoFactorSetupMutation.mutate({ code: twoFactorCode })
                  }
                  disabled={
                    twoFactorCode.length !== 6 ||
                    confirmTwoFactorSetupMutation.isPending
                  }
                >
                  {confirmTwoFactorSetupMutation.isPending
                    ? "Confirming…"
                    : "Confirm"}
                </Button>
              </div>
              {confirmTwoFactorSetupMutation.error && (
                <p className="login-error" role="alert">
                  {confirmTwoFactorSetupMutation.error.message}
                </p>
              )}
            </div>
          ) : (
            <div className="security-card">
              <div className="security-card-head">
                <ShieldCheck size={18} />
                <strong>Two-factor authentication is off</strong>
              </div>
              <p>
                Adding 2FA requires a code from your phone whenever you sign in,
                keeping your responder account safer even if your password is
                compromised.
              </p>
              <Button
                type="button"
                onClick={() =>
                  beginTwoFactorSetupMutation.mutate(undefined, {
                    onSuccess: data => {
                      setTwoFactorSetup(data);
                      setTwoFactorCode("");
                    },
                  })
                }
                disabled={beginTwoFactorSetupMutation.isPending}
              >
                {beginTwoFactorSetupMutation.isPending
                  ? "Preparing…"
                  : "Enable 2FA"}
              </Button>
              {beginTwoFactorSetupMutation.error && (
                <p className="login-error" role="alert">
                  {beginTwoFactorSetupMutation.error.message}
                </p>
              )}
            </div>
          )}
          {!status && !twoFactorQuery.isLoading && (
            <p className="empty-copy">Unable to load security status.</p>
          )}
        </div>
      </section>
    );
  }
  if (active === "Risk reports") {
    const allReports = isStaticSession() ? staticReports : (liveReports ?? []);
    const filteredReports = allReports.filter(report =>
      !normalizedSearch || `${report.reportCode} ${report.reportType} ${report.location} ${report.status} ${report.priority}`.toLowerCase().includes(normalizedSearch)
    );
    const priorityColor = (p: string) => p === "CRITICAL" ? "rose" : p === "HIGH" ? "amber" : p === "MEDIUM" ? "blue" : "teal";
    return (
      <section className="workspace-view panel responder-incident-map">
        <div className="workspace-view-head">
          <div>
            <span className="eyebrow">REPORTS DESK</span>
            <h2>Incident reports</h2>
            <p>All submitted risk and emergency reports. Review, update status, and coordinate response.</p>
          </div>
        </div>
        {updateRiskReportMutation.error && <p className="login-error" role="alert">{updateRiskReportMutation.error.message}</p>}
        <div className="responder-incident-list" style={{ maxHeight: "none", padding: "1rem" }}>
          {filteredReports.length === 0 && <p className="empty-copy">No incident reports found.</p>}
          {filteredReports.map(report => (
            <article className="responder-incident-item" key={report.id}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <strong>{report.reportCode}</strong>
                <span>{report.reportType}</span>
                <span className={`table-status ${priorityColor(report.priority)}`}>{report.priority}</span>
                <span className={`table-status ${report.status === "RESOLVED" ? "teal" : report.status === "IN_PROGRESS" ? "blue" : report.status === "REJECTED" ? "rose" : "amber"}`}>{report.status}</span>
              </div>
              <p><MapPin size={13} style={{ display: "inline", verticalAlign: "middle" }} /> {report.location}{report.createdAt && <small style={{ marginLeft: "0.5rem" }}>{new Date(report.createdAt).toLocaleString()}</small>}</p>
              <button
                type="button"
                className="incident-timeline-button"
                onClick={() => onOpenIncident?.({
                  id: report.reportCode,
                  type: report.reportType,
                  location: report.location,
                  priority: report.priority,
                  time: report.createdAt ? new Date(report.createdAt).toLocaleString() : "—",
                  color: priorityColor(report.priority),
                  reportId: report.id,
                  status: report.status,
                  createdAt: report.createdAt,
                  resolution: report.resolution,
                  assignedResponderId: report.assignedResponderId ?? null,
                }, report.id)}
              >View incident timeline <ChevronRight size={14} /></button>
              <div className="responder-incident-actions">
                {report.latitude != null && report.longitude != null
                  ? <a href={`https://www.google.com/maps/dir/?api=1&destination=${report.latitude},${report.longitude}`} target="_blank" rel="noreferrer"><MapPin size={14} /> Go there</a>
                  : <small>No coordinates on this report.</small>}
                {report.status === "RESOLVED"
                  ? <small><CheckCircle2 size={14} /> Resolved</small>
                  : (user?.role === "responder" || user?.role === "admin") && <>
                    <select
                      aria-label="Update report status"
                      className="role-select"
                      value={report.status}
                      onChange={e => {
                        if (!isStaticSession()) {
                          updateRiskReportMutation.mutate({ reportId: report.id, status: e.target.value as ReportStatus });
                        }
                      }}
                    >
                      {(["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED", "REJECTED"] as ReportStatus[]).map(option => (
                        <option key={option} value={option} disabled={option !== report.status && !canTransitionReport(report.status as ReportStatus, option)}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {canTransitionReport(report.status as ReportStatus, "RESOLVED") && (
                      <Button type="button" variant="outline" onClick={() => markIncidentDone(report.id)} disabled={updateRiskReportMutation.isPending}>
                        <CheckCircle2 size={14} /> Mark done
                      </Button>
                    )}
                  </>}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className={`workspace-view panel ${user?.role === "staff" ? "staff-workspace" : ""}`}>
      <div className="workspace-view-head">
        <div>
          <span className="eyebrow">{view.eyebrow}</span>
          <h2>{view.title}</h2>
          <p>{view.description}</p>
        </div>
        <div className="workspace-actions">
          <Button variant="outline" onClick={exportView}>Export view</Button>
          {active === "Alerts"
            ? user?.role === "admin" && (
                <Button onClick={() => setRecordOpen(true)}>
                  <Bell size={15} /> Create alert
                </Button>
              )
            : <Button disabled={!canAddRecord} onClick={() => setRecordOpen(true)}>Add record</Button>}
        </div>
      </div>
      <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead>
            <tr>
              {tableColumns.map(column => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workspaceRows.map((row, index) => (
              <tr key={`${active}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={cell}>
                    {active === "Alerts" && cellIndex === 0 && alertMessages[index] ? (
                      <div className="alert-table-cell">
                        <strong>{cell}</strong>
                        <span className="alert-table-tag">{alertMessages[index].alertType}</span>
                        <p>{alertMessages[index].message}</p>
                      </div>
                    ) : active === "Risk reports" && cellIndex === 2 && reportDestinations[index] ? (
                      <a href={reportDestinations[index]} target="_blank" rel="noreferrer" className="table-location-link">{cell} <MapIcon size={13} /></a>
                    ) : (
                      <span
                        className={
                          cellIndex === row.length - 1
                            ? `table-status ${cell.includes("CRITICAL") || cell.includes("OUT") ? "rose" : cell.includes("LOW") || cell.includes("HIGH") || cell.includes("FULL") ? "amber" : "teal"}`
                            : ""
                        }
                      >
                        {cell}
                      </span>
                    )}
                  </td>
                ))}
                {active === "Evacuation centers" && visibleCenterRows?.[index] ? (
                  <td>
                    <Button type="button" variant="outline" onClick={() => { const center = visibleCenterRows[index]; setEditingCenter({ id: center.id, name: center.name, currentOccupancy: center.currentOccupancy, maximumCapacity: center.maximumCapacity }); setEditCenterName(center.name); setEditOccupancy(String(center.currentOccupancy)); setEditError(""); }}>
                      <Pencil size={14} /> Edit center
                    </Button>
                    <Button type="button" variant="outline" onClick={() => {
                      if (!window.confirm(`Delete ${visibleCenterRows[index].name}?`)) return;
                      if (isStaticSession()) {
                        const nextCenters = (centers ?? []).filter(center => center.id !== visibleCenterRows[index].id);
                        writeStaticCenters(nextCenters);
                        onStaticCentersChange?.(nextCenters);
                        return;
                      }
                      archiveCenterMutation.mutate({ centerId: visibleCenterRows[index].id });
                    }} disabled={archiveCenterMutation.isPending}>
                      <Trash2 size={14} /> Delete
                    </Button>
                  </td>
                ) : active === "Resources" && visibleResourceRows[index] ? (
                  <td>
                    <Button type="button" variant="outline" onClick={() => { const resource = visibleResourceRows[index]; setEditingResource(resource); setEditResourceQuantity(String(resource.quantity)); setEditResourceMinimum(String(resource.minimumStock)); setResourceError(""); }}><Pencil size={14} /> Edit stock</Button>
                    <Button type="button" variant="outline" onClick={() => {
                      const resource = visibleResourceRows[index];
                      if (!window.confirm(`Remove ${resource.name} from inventory?`)) return;
                      if (isStaticSession()) {
                        const nextResources = (resources ?? []).map(item => item.id === resource.id ? { ...item, quantity: 0, status: "OUT_OF_STOCK" } : item);
                        writeStaticResources(nextResources);
                        onStaticResourcesChange?.(nextResources);
                        return;
                      }
                      removeResourceMutation.mutate({ resourceId: resource.id });
                    }} disabled={removeResourceMutation.isPending}><Trash2 size={14} /> Remove</Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="workspace-note">
        <ShieldCheck size={15} /> Changes are permissioned, logged, and
        synchronized with the operations database.
      </div>
      {recordOpen && canAddRecord && (
        <div className="modal-backdrop" onClick={closeRecordForm}>
          <form className="report-modal" onClick={event => event.stopPropagation()} onSubmit={submitRecord}>
            <div className="modal-title"><div><span className="eyebrow">RECORD MANAGEMENT</span><h2>{recordTitle}</h2></div><button type="button" onClick={closeRecordForm}><X size={18} /></button></div>
            {active === "Evacuation centers" ? <>
              <label>Center code<Input value={recordEmail} onChange={event => setRecordEmail(event.target.value)} placeholder="CENTER-001" required /></label>
              <label>Center name<Input value={recordName} onChange={event => setRecordName(event.target.value)} placeholder="Pateros Community Center" required /></label>
              <label>Address<Input value={recordCategory} onFocus={() => setLocationPickerOpen(true)} onChange={event => setRecordCategory(event.target.value)} placeholder="Street or landmark" required /></label>
              {locationPickerOpen && <PaterosLocationPicker latitude={Number(recordLatitude)} longitude={Number(recordLongitude)} onPick={(latitude, longitude) => { setRecordLatitude(latitude.toFixed(6)); setRecordLongitude(longitude.toFixed(6)); }} />}
              <label>Barangay<Input value={recordUnit} onChange={event => setRecordUnit(event.target.value)} placeholder="Barangay" required /></label>
              <label>Maximum capacity<Input type="number" min="1" value={recordQuantity} onChange={event => setRecordQuantity(event.target.value)} required /></label>
            </> : active === "Resources" ? <>
              <label>Resource name<Input value={recordName} onChange={event => setRecordName(event.target.value)} placeholder="Drinking water" required /></label>
              <label>Unit<Input value={recordUnit} onChange={event => setRecordUnit(event.target.value)} placeholder="liters, kits, boxes" required /></label>
              <label>Quantity<Input type="number" min="0" value={recordQuantity} onChange={event => setRecordQuantity(event.target.value)} required /></label>
              <label>Minimum stock<Input type="number" min="0" value={recordMinimumStock} onChange={event => setRecordMinimumStock(event.target.value)} required /></label>
              <label>Evacuation center<select value={recordCenterId} onChange={event => setRecordCenterId(event.target.value)} required><option value="">Select a center</option>{centers?.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label>
            </> : <>
              <label>First name<Input value={recordName} onChange={event => setRecordName(event.target.value)} required /></label>
              <label>Last name<Input value={recordCategory} onChange={event => setRecordCategory(event.target.value)} required /></label>
              <label>Age<Input type="number" min="0" max="120" value={recordAge} onChange={event => setRecordAge(event.target.value)} required /></label>
              <label>Sex<select value={recordSex} onChange={event => setRecordSex(event.target.value as typeof recordSex)}><option value="UNSPECIFIED">Unspecified</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></select></label>
              <label>Evacuation center<select value={recordCenterId} onChange={event => setRecordCenterId(event.target.value)} required><option value="">Select a center</option>{centers?.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label>
            </>}
            {(recordError || createCenterMutation.error || createResourceMutation.error || registerEvacueeMutation.error) && <p className="login-error" role="alert">{recordError || createCenterMutation.error?.message || createResourceMutation.error?.message || registerEvacueeMutation.error?.message}</p>}
            <div className="modal-actions"><Button type="button" variant="outline" onClick={closeRecordForm}>Cancel</Button><Button type="submit" disabled={createCenterMutation.isPending || createResourceMutation.isPending || registerEvacueeMutation.isPending}>Save record</Button></div>
          </form>
        </div>
      )}
      {recordOpen && active === "Alerts" && user?.role === "admin" && (
        <div className="modal-backdrop" onClick={() => setRecordOpen(false)}>
          <form className="report-modal" onClick={event => event.stopPropagation()} onSubmit={submitAlert}>
            <div className="modal-title"><div><span className="eyebrow">BROADCAST CONTROL</span><h2>Create alert</h2></div><button type="button" onClick={() => setRecordOpen(false)}><X size={18} /></button></div>
            <label>Title<Input value={alertForm.title} onChange={event => setAlertForm(previous => ({ ...previous, title: event.target.value }))} placeholder="Flood warning · Sta. Ana" required minLength={3} /></label>
            <label>Message<Input value={alertForm.message} onChange={event => setAlertForm(previous => ({ ...previous, message: event.target.value }))} placeholder="Water level rising near C-5." required minLength={5} /></label>
            <label>Type<Input value={alertForm.alertType} onChange={event => setAlertForm(previous => ({ ...previous, alertType: event.target.value }))} placeholder="FLOOD_WARNING" required minLength={2} /></label>
            <label>Priority<select className="role-select" value={alertForm.priority} onChange={event => setAlertForm(previous => ({ ...previous, priority: event.target.value as typeof alertForm.priority }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
            <label>Audience<select className="role-select" value={alertForm.targetAudience} onChange={event => setAlertForm(previous => ({ ...previous, targetAudience: event.target.value as typeof alertForm.targetAudience }))}><option value="ALL_USERS">All users</option><option value="CITIZENS">Citizens</option><option value="STAFF">Staff</option><option value="RESPONDERS">Responders</option><option value="ADMIN">Admins only</option></select></label>
            {createAlertMutation.error && <p className="login-error" role="alert">{createAlertMutation.error.message}</p>}
            <div className="modal-actions"><Button type="button" variant="outline" onClick={() => setRecordOpen(false)}>Cancel</Button><Button type="submit" disabled={createAlertMutation.isPending || !alertForm.title.trim() || !alertForm.message.trim()}>{createAlertMutation.isPending ? "Broadcasting…" : "Broadcast alert"}</Button></div>
          </form>
        </div>
      )}
      {editingCenter && (
        <div className="modal-backdrop" onClick={() => setEditingCenter(null)}>
          <form className="report-modal" onClick={event => event.stopPropagation()} onSubmit={event => {
            event.preventDefault();
            const centerName = editCenterName.trim();
            const occupancyValue = Number(editOccupancy);
            if (centerName.length < 2) {
              setEditError("Enter a center name.");
              return;
            }
            if (!Number.isInteger(occupancyValue) || occupancyValue < 0 || occupancyValue > editingCenter.maximumCapacity) {
              setEditError(`Enter a whole number from 0 to ${editingCenter.maximumCapacity}.`);
              return;
            }
            if (isStaticSession()) {
              const nextCenters = (centers ?? []).map(center => center.id === editingCenter.id ? { ...center, name: centerName, currentOccupancy: occupancyValue, status: occupancyValue >= center.maximumCapacity ? "FULL" : "OPEN" } : center);
              writeStaticCenters(nextCenters);
              onStaticCentersChange?.(nextCenters);
              setEditingCenter(null);
              return;
            }
            updateCenterMutation.mutate({ id: editingCenter.id, data: { name: centerName, currentOccupancy: occupancyValue } });
          }}>
            <div className="modal-title"><div><span className="eyebrow">CENTER OPERATIONS</span><h2>Edit occupancy</h2></div><button type="button" onClick={() => setEditingCenter(null)}><X size={18} /></button></div>
            <label>Center name<Input value={editCenterName} onChange={event => setEditCenterName(event.target.value)} required /></label>
            <p>Capacity {editingCenter.maximumCapacity}</p>
            <label>Current occupancy<Input type="number" min="0" max={editingCenter.maximumCapacity} value={editOccupancy} onChange={event => setEditOccupancy(event.target.value)} required /></label>
            {(editError || updateCenterMutation.error) && <p className="login-error" role="alert">{editError || updateCenterMutation.error?.message}</p>}
            <div className="modal-actions"><Button type="button" variant="outline" onClick={() => setEditingCenter(null)}>Cancel</Button><Button type="submit" disabled={updateCenterMutation.isPending}>Save occupancy</Button></div>
          </form>
        </div>
      )}
      {editingResource && (
        <div className="modal-backdrop" onClick={() => setEditingResource(null)}>
          <form className="report-modal" onClick={event => event.stopPropagation()} onSubmit={event => {
            event.preventDefault();
            const quantity = Number(editResourceQuantity);
            const minimumStock = Number(editResourceMinimum);
            if (!Number.isInteger(quantity) || quantity < 0 || !Number.isInteger(minimumStock) || minimumStock < 0) { setResourceError("Enter whole numbers of zero or more."); return; }
            if (isStaticSession()) {
              const nextResources = (resources ?? []).map(resource => resource.id === editingResource.id ? { ...resource, quantity, minimumStock, status: quantity === 0 ? "OUT_OF_STOCK" : quantity <= minimumStock ? "LOW_STOCK" : "AVAILABLE" } : resource);
              writeStaticResources(nextResources);
              onStaticResourcesChange?.(nextResources);
              setEditingResource(null);
              return;
            }
            updateResourceMutation.mutate({ resourceId: editingResource.id, data: { quantity, minimumStock } });
          }}>
            <div className="modal-title"><div><span className="eyebrow">SUPPLY CHAIN</span><h2>Edit resource stock</h2></div><button type="button" onClick={() => setEditingResource(null)}><X size={18} /></button></div>
            <p>{editingResource.name}</p>
            <label>Quantity<Input type="number" min="0" value={editResourceQuantity} onChange={event => setEditResourceQuantity(event.target.value)} required /></label>
            <label>Minimum stock<Input type="number" min="0" value={editResourceMinimum} onChange={event => setEditResourceMinimum(event.target.value)} required /></label>
            {(resourceError || updateResourceMutation.error) && <p className="login-error" role="alert">{resourceError || updateResourceMutation.error?.message}</p>}
            <div className="modal-actions"><Button type="button" variant="outline" onClick={() => setEditingResource(null)}>Cancel</Button><Button type="submit" disabled={updateResourceMutation.isPending}>Save stock</Button></div>
          </form>
        </div>
      )}
    </section>
  );
}

function DemoAccountsWorkspace({
  demoAccounts,
  isLoading,
  error,
  refetch,
  revokeId,
  setRevokeId,
  revokeMutation,
}: DemoAccountsWorkspaceProps) {
  const [filter, setFilter] = useState<
    "ALL" | "ACTIVE" | "EXPIRED" | "REVOKED"
  >("ALL");
  const [search, setSearch] = useState("");
  const accounts = demoAccounts ?? [];
  const filteredAccounts = accounts.filter(
    account =>
      (filter === "ALL" || account.status === filter) &&
      `${account.name ?? ""} ${account.email ?? ""} ${account.role}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  const counts = {
    all: accounts.length,
    active: accounts.filter(account => account.status === "ACTIVE").length,
    expired: accounts.filter(account => account.status === "EXPIRED").length,
    revoked: accounts.filter(account => account.status === "REVOKED").length,
  };
  const statusTone = (status: DemoAccountRecord["status"]) =>
    status === "ACTIVE" ? "teal" : status === "EXPIRED" ? "amber" : "rose";
  const dateLabel = (value: Date | null) =>
    value ? new Date(value).toLocaleString() : "Never";
  return (
    <section className="workspace-view panel demo-dashboard">
      <div className="workspace-view-head">
        <div>
          <span className="eyebrow">TRAINING CONTROL</span>
          <h2>Demo account dashboard</h2>
          <p>
            Monitor temporary training accounts, review expiry windows, and
            revoke access immediately when a drill ends.
          </p>
        </div>
        <div className="workspace-actions">
          <Button
            variant="outline"
            onClick={() => window.location.assign(getLoginPath())}
          >
            <LogIn size={15} /> Log in
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.assign(getRegisterPath())}
          >
            <UserPlus size={15} /> Register
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw size={15} className={isLoading ? "login-spinner" : ""} />{" "}
            Refresh
          </Button>
        </div>
      </div>
      <div className="demo-summary-grid">
        <button
          className={`demo-summary-card ${filter === "ALL" ? "selected" : ""}`}
          onClick={() => setFilter("ALL")}
        >
          <span>Total demo accounts</span>
          <strong>{counts.all}</strong>
          <small>Temporary training identities</small>
        </button>
        <button
          className={`demo-summary-card teal ${filter === "ACTIVE" ? "selected" : ""}`}
          onClick={() => setFilter("ACTIVE")}
        >
          <span>Active</span>
          <strong>{counts.active}</strong>
          <small>Can sign in now</small>
        </button>
        <button
          className={`demo-summary-card amber ${filter === "EXPIRED" ? "selected" : ""}`}
          onClick={() => setFilter("EXPIRED")}
        >
          <span>Expired</span>
          <strong>{counts.expired}</strong>
          <small>Past the expiry window</small>
        </button>
        <button
          className={`demo-summary-card rose ${filter === "REVOKED" ? "selected" : ""}`}
          onClick={() => setFilter("REVOKED")}
        >
          <span>Revoked</span>
          <strong>{counts.revoked}</strong>
          <small>Access blocked by admin</small>
        </button>
      </div>
      <div className="demo-dashboard-toolbar">
        <div className="search-box demo-search">
          <Search size={16} />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search demo accounts"
            aria-label="Search demo accounts"
          />
        </div>
        <div
          className="demo-filter-tabs"
          role="tablist"
          aria-label="Filter demo accounts"
        >
          {(["ALL", "ACTIVE", "EXPIRED", "REVOKED"] as const).map(item => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === item}
              className={filter === item ? "selected" : ""}
              key={item}
              onClick={() => setFilter(item)}
            >
              {item === "ALL" ? "All" : item[0] + item.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="login-error" role="alert">
          <span className="login-error-icon" aria-hidden="true">
            !
          </span>
          <span>
            Demo accounts could not be loaded. {error.message || "Try again."}
          </span>
          <Button variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {isLoading ? (
        <div className="demo-empty-state" role="status" aria-live="polite">
          <LoaderCircle className="login-spinner" size={24} />
          <strong>Loading demo accounts…</strong>
          <span>Checking temporary access status.</span>
        </div>
      ) : filteredAccounts.length ? (
        <div className="demo-account-list">
          {filteredAccounts.map(account => (
            <article className="demo-account-card" key={account.id}>
              <div className="demo-account-head">
                <div className="demo-account-identity">
                  <div
                    className={`demo-account-avatar ${statusTone(account.status)}`}
                  >
                    <UserRoundCheck size={19} />
                  </div>
                  <div>
                    <strong>
                      {account.name || "Unnamed training account"}
                    </strong>
                    <span>{account.email || "No email"}</span>
                  </div>
                </div>
                <span className={`demo-status ${statusTone(account.status)}`}>
                  <span aria-hidden="true">
                    {account.status === "ACTIVE" ? (
                      <CheckCircle2 size={14} />
                    ) : account.status === "EXPIRED" ? (
                      <Clock3 size={14} />
                    ) : (
                      <Ban size={14} />
                    )}
                  </span>
                  {account.status}
                </span>
              </div>
              <div className="demo-account-details">
                <div>
                  <small>Role</small>
                  <strong>{formatRoleLabel(account.role)}</strong>
                </div>
                <div>
                  <small>Created</small>
                  <strong>{dateLabel(account.createdAt)}</strong>
                </div>
                <div>
                  <small>
                    {account.status === "REVOKED" ? "Revoked" : "Expires"}
                  </small>
                  <strong>
                    {account.status === "REVOKED"
                      ? dateLabel(account.demoRevokedAt)
                      : dateLabel(account.demoExpiresAt)}
                  </strong>
                </div>
                <div>
                  <small>Last sign-in</small>
                  <strong>{dateLabel(account.lastSignedIn)}</strong>
                </div>
              </div>
              {account.status === "ACTIVE" && (
                <div className="demo-account-action">
                  {revokeId === account.id ? (
                    <div className="demo-revoke-confirm">
                      <span>Revoke access for this account?</span>
                      <Button
                        variant="outline"
                        onClick={() => setRevokeId(null)}
                        disabled={revokeMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() =>
                          revokeMutation.mutate({ userId: account.id })
                        }
                        disabled={revokeMutation.isPending}
                      >
                        {revokeMutation.isPending ? (
                          <>
                            <LoaderCircle className="login-spinner" size={15} />{" "}
                            Revoking…
                          </>
                        ) : (
                          <>
                            <Ban size={15} /> Confirm revoke
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setRevokeId(account.id)}
                    >
                      <ShieldAlert size={15} /> Revoke access
                    </Button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="demo-empty-state">
          <UserRoundCheck size={24} />
          <strong>
            {accounts.length
              ? "No matching demo accounts"
              : "No demo accounts provisioned"}
          </strong>
          <span>
            {accounts.length
              ? "Try another search or status filter."
              : "Create a temporary account from User & roles to begin a training session."}
          </span>
        </div>
      )}
      {revokeMutation.error && (
        <p className="login-error" role="alert">
          <span className="login-error-icon" aria-hidden="true">
            !
          </span>
          <span>
            That demo account could not be revoked.{" "}
            {revokeMutation.error.message || "Try again."}
          </span>
        </p>
      )}
      <div className="workspace-note">
        <ShieldCheck size={15} /> Demo credentials are shown only once during
        provisioning. Revoked access cannot sign in again, and every status
        change is written to the activity log.
      </div>
    </section>
  );
}
