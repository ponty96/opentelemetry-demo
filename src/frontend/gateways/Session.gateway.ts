// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { v4 } from 'uuid';
import { DEFAULT_SEGMENT, ISegment } from '../utils/Segments';

interface ISession {
  userId: string;
  currencyCode: string;
  segment: ISegment;
}

const sessionKey = 'session';
const defaultSession: Readonly<ISession> = Object.freeze({
  userId: v4(),
  currencyCode: 'USD',
  segment: DEFAULT_SEGMENT,
});

const SessionGateway = () => ({
  getSession(): ISession {
    if (typeof window === 'undefined') return defaultSession;
    const sessionString = localStorage.getItem(sessionKey);

    if (sessionString) {
      try {
        const parsed: unknown = JSON.parse(sessionString);
        if (isValid(parsed)) {
          return { ...parsed, segment: { ...DEFAULT_SEGMENT, ...parsed.segment } };
        }
      } catch (e) {
        console.warn('Failed to parse session from localStorage', e);
      }
    }
    localStorage.setItem(sessionKey, JSON.stringify(defaultSession));
    return defaultSession;
  },
  setSessionValue<K extends keyof ISession>(key: K, value: ISession[K]) {
    const session = this.getSession();

    localStorage.setItem(sessionKey, JSON.stringify({ ...session, [key]: value }));
  },
  updateSegment(segment: Partial<ISegment>) {
    const session = this.getSession();
    this.setSessionValue('segment', { ...session.segment, ...segment });
  },
});

const isValid = (session: unknown): session is ISession => {
  return (
    typeof session === 'object' &&
    session !== null &&
    typeof (session as ISession).userId === 'string' &&
    typeof (session as ISession).currencyCode === 'string'
  );
};

export default SessionGateway();
