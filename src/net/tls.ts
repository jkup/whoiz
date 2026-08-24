import { connect } from "node:tls";

export interface CertInfo {
  issuer: string;
  sans: string[];
}

export function certInfo(host: string, timeout = 5000): Promise<CertInfo | undefined> {
  return new Promise((resolve) => {
    const sock = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout });
    const done = (v?: CertInfo) => {
      sock.destroy();
      resolve(v);
    };
    sock.once("secureConnect", () => {
      const cert = sock.getPeerCertificate();
      if (!cert || !cert.issuer) return done();
      const raw = cert.issuer.O ?? cert.issuer.CN ?? "";
      const issuer = Array.isArray(raw) ? raw.join(" ") : raw;
      const sans = (cert.subjectaltname ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^DNS:/, ""))
        .filter(Boolean);
      done({ issuer, sans });
    });
    sock.once("error", () => done());
    sock.once("timeout", () => done());
  });
}
