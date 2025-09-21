import React from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

type GuideContent = {
  title: string;
  intro: string;
  siteIntroTitle: string;
  siteIntroDescription: string;
  siteHighlights?: string[];
  steps: string[];
  tips?: string[];
};

const guides: Record<string, GuideContent> = {
  ko: {
    title: '사용 가이드',
    intro: 'UID 인증과 신호 구독을 빠르게 설정하려면 아래 순서를 따라 주세요.',
    siteIntroTitle: '서비스 소개',
    siteIntroDescription:
      '이 페이지는 트레이딩뷰 지표 알림을 Gate.io 선물 계정과 연동하기 위한 사용자 포털입니다. UID 인증부터 신호 모니터링, API 연결까지 한 화면에서 처리할 수 있습니다.',
    siteHighlights: [
      'UID 기반 승인으로 검증된 사용자만 전략 신호를 수신합니다.',
      '승인 후 개인 API 키를 연결해 자동 거래와 실시간 전략 신호를 확인할 수 있습니다.',
      '관리자 콘솔에서 UID 승인, 전략 배포, 실시간 로그를 통합 관리합니다.',
    ],
    steps: [
      '상단에서 언어와 네트워크(메인넷·테스트넷)를 확인한 뒤 UID를 입력하고 UID 로그인을 실행합니다.',
      'UID 등록 버튼을 누르면 요청이 관리자에게 전달됩니다. 최대 3시간 내에 승인 안내를 드립니다.',
      '승인 후에는 API 연결과 실시간 신호 확인이 가능하며, 웹훅 전달 여부는 관리자 콘솔에서만 관리됩니다.',
    ],
    tips: [
      '사용자 화면에서는 전략이나 웹훅을 따로 선택하지 않습니다. 승인된 전략은 관리자 페이지에서 할당됩니다.',
      '다른 전략을 이용하고 싶다면 관리자에게 문의해 승인 전략을 조정해 달라고 요청하세요.',
    ],
  },
  en: {
    title: 'Usage Guide',
    intro: 'Follow these steps to request access and receive indicator signals promptly.',
    siteIntroTitle: 'What this service offers',
    siteIntroDescription:
      'This portal links TradingView indicator alerts with Gate.io futures accounts. It centralizes UID verification, signal monitoring, and API setup for approved users.',
    siteHighlights: [
      'UID approval controls who can receive strategy signals.',
      'After approval you can plug in personal API keys to automate trades and follow live strategy updates.',
      'The admin console manages UID approvals, strategy distribution, and real-time operational logs.',
    ],
    steps: [
      'Verify the language and network (Mainnet or Testnet), then enter your UID and press “UID Login.”',
      'Hit “Register UID” to send the request to the admins. They review it within three hours and notify you once approved.',
      'After approval you can connect the API and monitor live signals. Webhook delivery is handled from the admin console.',
    ],
    tips: [
      'End users do not configure strategies or webhooks here. The admin assigns approved strategies after reviewing your request.',
      'If you need different strategies later, contact the admin team to update your approvals.',
    ],
  },
  ja: {
    title: 'ご利用ガイド',
    intro: 'UID 認証とシグナル配信をスムーズに開始するための手順です。',
    siteIntroTitle: 'サービス概要',
    siteIntroDescription:
      '本ポータルは TradingView のインジケーター通知を Gate.io 先物アカウントに連携するためのユーザーページです。UID 認証、シグナル確認、API 接続を一つの画面で管理できます。',
    siteHighlights: [
      'UID 承認を受けたユーザーのみが戦略シグナルを受信できるよう制御しています。',
      '承認後はご自身の API キーを接続し、自動売買やリアルタイムシグナルの確認が可能になります。',
      '管理者コンソールでは UID 承認、戦略配信、リアルタイムログを一括監視します。',
    ],
    steps: [
      '画面上部で言語とネットワーク（メインネット / テストネット）を確認し、UID を入力して「UID ログイン」を押します。',
      '「UID 登録」を押すと申請が管理者に送信されます。最大 3 時間以内に承認結果をご案内します。',
      '承認後に API を接続してリアルタイムシグナルを確認できます。Webhook の配信設定は管理者コンソールのみで管理されます。',
    ],
    tips: [
      'ユーザー画面で戦略や Webhook を選択する必要はありません。承認後の戦略は管理者が割り当てます。',
      '別の戦略を希望する場合は管理者に連絡し、承認内容の変更を依頼してください。',
    ],
  },
};

const UsageGuide: React.FC = () => {
  const { state } = useAppContext();
  const guide = guides[state.language] ?? guides.ko;

  return (
    <Card title={guide.title} className="mb-5">
      <div className="space-y-5 text-sm text-gray-200">
        <div className="bg-black/30 border border-gate-primary/30 rounded-lg p-4 space-y-2">
          <h3 className="text-base font-semibold text-gate-primary">{guide.siteIntroTitle}</h3>
          <p className="text-sm text-gray-200">{guide.siteIntroDescription}</p>
          {guide.siteHighlights && guide.siteHighlights.length > 0 && (
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-400">
              {guide.siteHighlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-gray-300">{guide.intro}</p>
          <ol className="list-decimal list-inside space-y-2">
            {guide.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>

        {guide.tips && guide.tips.length > 0 && (
          <div className="bg-black/30 border border-gray-700 rounded-lg p-3 space-y-1 text-xs text-gray-400">
            {guide.tips.map((tip, index) => (
              <p key={index}>• {tip}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default UsageGuide;
