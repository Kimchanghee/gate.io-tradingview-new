import React from 'react';
import { useAppContext } from '../contexts/AppContext';

const PromoBanner: React.FC = () => {
  const { state, translate } = useAppContext();
  
  const handleBannerClick = () => {
    // Gate.io 추천인 링크로 변경
    window.open('https://www.gate.com/share/DJBWKAIF', '_blank');
  };

  // 언어별 텍스트
  const bannerTexts = {
    ko: {
      mainTitle: 'Gate.io 거래소 가입하고 혜택받자!',
      subTitle: '지금 가입하면 거래 수수료 최대 50% 할인',
      discountBadge: '50%',
      discountText: 'OFF',
      ctaButton: '지금 가입하기',
      upTo: '최대',
      mobileMainTitle: 'Gate.io 가입 혜택',
      mobileSubTitle: '수수료 50% 할인',
      mobileUpTo: '최대'
    },
    en: {
      mainTitle: 'Join Gate.io and Get Benefits!',
      subTitle: 'Sign up now and get up to 50% off trading fees',
      discountBadge: '50%',
      discountText: 'OFF',
      ctaButton: 'Sign Up Now',
      upTo: 'UP TO',
      mobileMainTitle: 'Gate.io Benefits',
      mobileSubTitle: '50% Fee Discount',
      mobileUpTo: 'MAX'
    },
    ja: {
      mainTitle: 'Gate.ioに登録して特典をゲット！',
      subTitle: '今すぐ登録で取引手数料最大50%割引',
      discountBadge: '50%',
      discountText: 'OFF',
      ctaButton: '今すぐ登録',
      upTo: '最大',
      mobileMainTitle: 'Gate.io 登録特典',
      mobileSubTitle: '手数料50%割引',
      mobileUpTo: '最大'
    }
  };

  const currentTexts = bannerTexts[state.language] || bannerTexts.ko;

  return (
    <div className="banner-wrapper mb-8">
      {/* PC 배너 */}
      <div className="pc-banner-container hidden lg:block">
        <div className="pc-banner" onClick={handleBannerClick}>
          {/* 차트 배경 */}
          <svg className="chart-bg" viewBox="0 0 300 120">
            <polyline
              className="chart-line"
              points="0,100 30,90 60,70 90,85 120,40 150,50 180,30 210,45 240,20 270,35 300,25"
            />
          </svg>

          <div className="banner-content">
            {/* Gate.io 로고 */}
            <div className="logo">
              GATE.IO
            </div>

            {/* 텍스트 섹션 */}
            <div className="text-section">
              <h2 className="main-title">{currentTexts.mainTitle}</h2>
              <p className="sub-title">{currentTexts.subTitle}</p>
            </div>

            {/* 할인 배지 */}
            <div className="discount-badge" data-upto={currentTexts.upTo}>
              {currentTexts.discountBadge}
              <div className="discount-text">{currentTexts.discountText}</div>
            </div>

            {/* CTA 버튼 */}
            <button className="cta-button">
              {currentTexts.ctaButton}
            </button>
          </div>

          {/* 반짝이 효과 */}
          <span className="sparkle sparkle1">✨</span>
          <span className="sparkle sparkle2">⭐</span>
          <span className="sparkle sparkle3">💫</span>
          <span className="sparkle sparkle4">✨</span>
        </div>
      </div>

      {/* 모바일 배너 */}
      <div className="mobile-banner-container lg:hidden">
        <div className="mobile-banner" onClick={handleBannerClick}>
          <div className="banner-content">
            {/* Gate.io 로고 */}
            <div className="logo">
              GATE
            </div>

            {/* 텍스트 섹션 */}
            <div className="text-section">
              <h2 className="main-title">{currentTexts.mobileMainTitle}</h2>
              <p className="sub-title">{currentTexts.mobileSubTitle}</p>
            </div>

            {/* 할인 배지 */}
            <div className="discount-badge" data-upto={currentTexts.mobileUpTo}>
              {currentTexts.discountBadge}
            </div>

            {/* CTA 버튼 */}
            <button className="cta-button">
              {currentTexts.ctaButton}
            </button>
          </div>

          {/* 반짝이 효과 */}
          <span className="sparkle sparkle1">✨</span>
          <span className="sparkle sparkle2">⭐</span>
        </div>
      </div>
    </div>
  );
};

export default PromoBanner;