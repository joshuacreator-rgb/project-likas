import { useRef } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IncidentSummary } from "@/pages/Home";

type TimelineEvent = {
  id: number;
  action: string;
  resourcesUsed?: string | null;
  arrivalAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
};

type ReportDetail = {
  reportCode: string;
  reportType: string;
  description: string;
  complainantName?: string | null;
  location: string;
  latitude?: string | null;
  longitude?: string | null;
  priority: string;
  status: string;
  reportedAt?: Date | string | null;
  respondedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
  resolution?: string | null;
  createdAt?: Date | string | null;
};

type Attachment = {
  id: number;
  fileName: string;
  status?: string | null;
};

type AuditEntry = {
  id: number;
  action: string;
  actorName?: string | null;
  createdAt: Date | string;
};

type Props = {
  incident: IncidentSummary;
  detail?: ReportDetail | null;
  actions?: TimelineEvent[];
  attachments?: Attachment[];
  assignedResponderName?: string | null;
  auditTrail?: AuditEntry[];
  printedBy?: string | null;
  onClose: () => void;
};

const formatDate = (value?: Date | string | null) => (value ? new Date(value).toLocaleString() : "—");
const statusLabel = (value?: string) => (value ?? "").replace(/_/g, " ") || "—";

export default function IncidentReportDocument({ incident, detail, actions, attachments, assignedResponderName, auditTrail, printedBy, onClose }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const reportCode = detail?.reportCode ?? incident.id;
  const reportType = detail?.reportType ?? incident.type;
  const description = detail?.description ?? "—";
  const complainant = detail?.complainantName ?? "—";
  const location = detail?.location ?? incident.location;
  const priority = detail?.priority ?? incident.priority;
  const status = detail?.status ?? incident.status;
  const reportedAt = detail?.reportedAt ?? incident.createdAt;
  const respondedAt = detail?.respondedAt;
  const resolvedAt = detail?.resolvedAt;
  const rejectedAt = detail?.rejectedAt;
  const resolution = detail?.resolution ?? incident.resolution;
  const latitude = detail?.latitude;
  const longitude = detail?.longitude;
  const exportedAt = new Date().toLocaleString();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="report-document" onClick={(e) => e.stopPropagation()}>
        <div className="report-document-toolbar no-print">
          <Button type="button" onClick={handlePrint}>
            <Printer size={15} /> Print / Save as PDF
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            <X size={15} /> Close
          </Button>
        </div>

        <div className="report-page" ref={pageRef}>
          <header className="report-header">
            <div>
              <h1>PROJECT LIKAS</h1>
              <p>Disaster Response &amp; Community Safety — Official Incident Report</p>
            </div>
            <div className="report-code">
              <small>Report code</small>
              <strong>{reportCode}</strong>
            </div>
          </header>

          <section className="report-section">
            <h2>Incident details</h2>
            <div className="report-grid">
              <div><small>Report type</small><strong>{reportType}</strong></div>
              <div><small>Priority</small><strong className={`incident-detail-priority ${incident.color}`}>{priority}</strong></div>
              <div><small>Status</small><strong>{statusLabel(status)}</strong></div>
              <div><small>Assigned responder</small><strong>{assignedResponderName ?? "Unassigned"}</strong></div>
              <div><small>Reported at</small><strong>{formatDate(reportedAt)}</strong></div>
              <div><small>Responded at</small><strong>{formatDate(respondedAt)}</strong></div>
              <div><small>Resolved at</small><strong>{formatDate(resolvedAt)}</strong></div>
              {rejectedAt && <div><small>Rejected at</small><strong>{formatDate(rejectedAt)}</strong></div>}
              <div><small>Complainant</small><strong>{complainant}</strong></div>
              <div><small>Location</small><strong>{location}</strong></div>
              {latitude && longitude && (
                <div><small>Coordinates</small><strong>{latitude}, {longitude}</strong></div>
              )}
            </div>
          </section>

          <section className="report-section">
            <h2>Description</h2>
            <p className="report-description">{description}</p>
          </section>

          {resolution && (
            <section className="report-section">
              <h2>Resolution / decision notes</h2>
              <p className="report-description">{resolution}</p>
            </section>
          )}

          {actions && actions.length > 0 && (
            <section className="report-section">
              <h2>Responder activity</h2>
              <table className="report-table">
                <thead>
                  <tr><th>Action</th><th>Resources used</th><th>Arrived</th><th>Completed</th><th>Logged</th></tr>
                </thead>
                <tbody>
                  {actions.map(action => (
                    <tr key={action.id}>
                      <td>{action.action}</td>
                      <td>{action.resourcesUsed || "—"}</td>
                      <td>{formatDate(action.arrivalAt)}</td>
                      <td>{formatDate(action.completedAt)}</td>
                      <td>{formatDate(action.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {auditTrail && auditTrail.length > 0 && (
            <section className="report-section">
              <h2>Report history (audit log)</h2>
              <table className="report-table">
                <thead>
                  <tr><th>Actor</th><th>Action</th><th>Logged</th></tr>
                </thead>
                <tbody>
                  {auditTrail.map(entry => (
                    <tr key={entry.id}>
                      <td>{entry.actorName || "System"}</td>
                      <td>{entry.action}</td>
                      <td>{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {attachments && attachments.length > 0 && (
            <section className="report-section">
              <h2>Attachments</h2>
              <ul className="report-attachments">
                {attachments.map(item => (
                  <li key={item.id}>{item.fileName} <small>({item.status})</small></li>
                ))}
              </ul>
            </section>
          )}

          <footer className="report-footer">
            <div><small>Printed by</small><strong>{printedBy || "—"}</strong></div>
            <div><small>Exported at</small><strong>{exportedAt}</strong></div>
            <div className="report-footer-note">Generated from the live operations database. This document is intended for official use.</div>
          </footer>
        </div>
      </div>
    </div>
  );
}
