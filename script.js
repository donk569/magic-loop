/**
 * 魔音循环 —— 自动播放 + 循环 + 真实状态显示
 *
 * 设计原则：
 * 1. 全程只有一个 <audio> 实例（HTML 里那个），不 new Audio，不会叠加声音。
 * 2. 状态只由真实媒体事件驱动（playing / pause / error），play() 成功不等于已出声。
 * 3. 自动播放被拦截时如实提示，不做隐藏播放器、不反复重试、不弹窗骚扰。
 */
(function () {
  'use strict';

  var audio = document.getElementById('audio');
  var waveEl = document.getElementById('wave');
  var statusEl = document.getElementById('status');
  var hintEl = document.getElementById('hint');

  if (!audio || !waveEl || !statusEl || !hintEl) {
    return;
  }

  var hasPlayed = false;
  var fatal = false;

  /* ------------------------------------------------------------ 波形 */

  var BAR_COUNT = 26;

  (function buildBars() {
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < BAR_COUNT; i++) {
      var bar = document.createElement('span');
      bar.className = 'bar';
      // 用固定公式生成高低起伏，避免每帧随机导致视觉抖动
      var height = 26 + Math.round(Math.abs(Math.sin(i * 0.72 + 0.4)) * 70);
      bar.style.setProperty('--h', String(height));
      bar.style.setProperty('--d', (i % 7) * 90 + 'ms');
      fragment.appendChild(bar);
    }
    waveEl.appendChild(fragment);
  })();

  /* ------------------------------------------------------------ 状态 */

  var ERROR_TEXT = {
    1: '音频加载被中断，刷新页面可以再试一次。',
    2: '网络中断，音频没下载完整，检查网络后刷新页面。',
    3: '音频无法解码，文件可能损坏了。',
    4: '找不到音频文件，或这个浏览器不支持 MP3（检查 assets/prank.mp3）。'
  };

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.dataset.tone = tone || 'idle';
  }

  function setHint(text) {
    hintEl.textContent = text;
  }

  function setLive(on) {
    waveEl.classList.toggle('is-live', !!on);
  }

  function showFatal() {
    if (fatal) {
      return;
    }
    fatal = true;
    setLive(false);
    setStatus('音频加载失败', 'error');
    var code = audio.error ? audio.error.code : 0;
    setHint(ERROR_TEXT[code] || '音频加载失败，请检查 assets/prank.mp3 是否可访问。');
  }

  function showAutoplayBlocked() {
    if (fatal) {
      return;
    }
    setLive(false);
    setStatus('当前浏览器限制了自动播放', 'warn');
    setHint('尤其 iPhone Safari：需要你先在页面上点一下才允许出声。页面不会假装自己播成功了。');
  }

  /* ------------------------------------------------------------ 媒体事件 */

  audio.addEventListener('playing', function () {
    hasPlayed = true;
    fatal = false;
    setLive(true);
    setStatus('正在循环播放', 'ok');
    setHint('声音会一直循环；关掉这个网页，声音就停了。');
  });

  audio.addEventListener('waiting', function () {
    if (fatal) {
      return;
    }
    setLive(false);
    setStatus('正在缓冲…', 'wait');
  });

  audio.addEventListener('pause', function () {
    if (fatal) {
      return;
    }
    setLive(false);
    if (audio.ended) {
      return;
    }
    setStatus('播放被暂停了', 'warn');
    setHint('浏览器或系统把播放暂停了（来电、切换音频设备等）。刷新页面可以重新开始。');
  });

  audio.addEventListener('ended', function () {
    // loop = true 时正常不会触发，这里只做兜底，保证不会静默结束。
    if (fatal) {
      return;
    }
    try {
      audio.currentTime = 0;
    } catch (error) {
      /* 忽略：某些浏览器在未就绪时不允许设置 currentTime */
    }
    attemptPlay(true);
  });

  audio.addEventListener('error', showFatal);

  /* ------------------------------------------------------------ 自动播放 */

  function attemptPlay(isRetry) {
    if (fatal) {
      return;
    }
    setStatus(isRetry ? '正在重新开始…' : '正在尝试自动播放…', 'wait');

    var result;
    try {
      result = audio.play();
    } catch (error) {
      // 很老的浏览器可能直接抛异常而不是返回 Promise
      showAutoplayBlocked();
      return;
    }

    if (!result || typeof result.then !== 'function') {
      // 老浏览器没有 Promise：状态交给 playing 事件
      return;
    }

    result
      .then(function () {
        // 这里刻意不写"播放成功"：真正的成功以 playing 事件为准
      })
      .catch(function (error) {
        var name = error && error.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          showAutoplayBlocked();
        } else if (name === 'NotSupportedError') {
          showFatal();
        } else if (name === 'AbortError') {
          // 加载被中断（例如用户马上离开），不刷错误提示
        } else {
          showAutoplayBlocked();
        }
      });
  }

  /* ------------------------------------------------------------ 启动 */

  // 需求 2.2 / 5.3：一个实例 + 原生循环
  audio.loop = true;

  // 脚本执行前媒体就已经报错的场景（例如文件不存在），要补一次检查
  if (audio.error) {
    showFatal();
    return;
  }

  if (typeof audio.canPlayType === 'function' && audio.canPlayType('audio/mpeg') === '') {
    fatal = true;
    setStatus('浏览器不支持 MP3', 'error');
    setHint('当前浏览器无法播放 MP3 音频。');
    return;
  }

  attemptPlay(false);

  // 兜底：3 秒内既没出声也没报错，说明被静默拦截了
  window.setTimeout(function () {
    if (!fatal && !hasPlayed && !audio.error && audio.paused) {
      showAutoplayBlocked();
    }
  }, 3000);
})();
