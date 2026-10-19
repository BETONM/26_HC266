// 어댑터 조립은 여기서만 한다. 화면은 이 모듈이 내보내는 인터페이스 값만 쓴다.

import {config} from '../config';
import type {ChatProvider} from './chat/ChatProvider';
import {HttpChatProvider} from './chat/HttpChatProvider';
import {MockChatProvider} from './chat/MockChatProvider';
import type {DeviceSource} from './device/DeviceSource';
import {HttpDeviceSource} from './device/HttpDeviceSource';
import {MockDeviceSource} from './device/mock/MockDeviceSource';
import type {GraphSource} from './graph/GraphSource';
import {HttpGraphSource} from './graph/HttpGraphSource';
import {MockGraphSource} from './graph/MockGraphSource';
import {HttpReportSource} from './report/HttpReportSource';
import {MockReportSource} from './report/MockReportSource';
import type {ReportSource} from './report/ReportSource';
import {HttpRunSource} from './run/HttpRunSource';
import {MockRunSource} from './run/MockRunSource';
import type {RunSource} from './run/RunSource';

export const graphSource: GraphSource =
  config.graph.source === 'http'
    ? new HttpGraphSource(config.graph.baseUrl)
    : new MockGraphSource({faults: config.mockFaults.graph});

// 목업 LLM은 목업 그래프를 직접 조회해 답한다. 그래프가 http이면 그 그래프를 조회한다.
export const chatProvider: ChatProvider =
  config.chat.source === 'http'
    ? new HttpChatProvider(config.chat.baseUrl)
    : new MockChatProvider(graphSource, {charDelayMs: config.chatCharDelayMs, faults: config.mockFaults.chat});

const mockRun =
  config.run.source === 'mock'
    ? new MockRunSource({stepMs: config.runMockStepMs, faults: config.mockFaults.run})
    : null;

export const runSource: RunSource = mockRun ?? new HttpRunSource(config.run.baseUrl);

// 목업 장비는 목업 로봇의 진행에 맞춰 센서 값과 장면을 바꾼다. 로봇이 실제면 진행을 모르니 바탕값에 머문다.
export const deviceSource: DeviceSource =
  config.device.source === 'http'
    ? new HttpDeviceSource(config.device.baseUrl, config.deviceRgb)
    : new MockDeviceSource({
        faults: config.mockFaults.device,
        offline: config.deviceMockOffline,
        stale: config.deviceMockStale,
        progress: () => mockRun?.progress() ?? null,
      });

// 목업 보고서는 이 브라우저의 실행 기록에서 만들거나 예시(fixture)를 준다. http는 서버가 가진 기록에서 받는다.
export const reportSource: ReportSource =
  config.report.source === 'http'
    ? new HttpReportSource(config.report.baseUrl)
    : new MockReportSource({faults: config.mockFaults.report});

export const configWarnings = config.warnings;
