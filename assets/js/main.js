(function () {
  'use strict';

  function toggleMenu() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('mainNav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }
  }

  function renderYear() {
    var yearEl = document.getElementById('year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  function buildEmbedUrl(post) {
    var isReel = post.type === 'VIDEO';
    if (isReel) {
      return 'https://www.instagram.com/reel/' + post.code + '/embed/';
    }
    return 'https://www.instagram.com/p/' + post.code + '/embed/';
  }

  function renderIgFeed() {
    var container = document.getElementById('igFeed');
    if (!container) return;
    var feedUrl = container.getAttribute('data-feed') || 'assets/data/instagram-feed.json';
    fetch(feedUrl)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.posts || !data.posts.length) {
          container.innerHTML = '<p class="text-center small" style="color:var(--text-soft);">Feed indisponível no momento — visite nosso Instagram.</p>';
          return;
        }
        var html = '';
        data.posts.forEach(function (post) {
          var caption = (post.caption || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          if (caption.length > 180) caption = caption.slice(0, 180) + '…';
          var dateLabel = formatDate(post.date);
          html += ''
            + '<article class="ig-card">'
            + '  <div class="ig-frame"><iframe loading="lazy" src="' + buildEmbedUrl(post) + '" allowfullscreen scrolling="no" title="Post do Instagram"></iframe></div>'
            + '  <div class="ig-meta">'
            + '    <span class="ig-date">' + dateLabel + '</span>'
            + '    <p class="ig-caption">' + caption + '</p>'
            + '    <a class="ig-link" href="' + post.permalink + '" target="_blank" rel="noopener">Ver no Instagram →</a>'
            + '  </div>'
            + '</article>';
        });
        container.innerHTML = html;
      })
      .catch(function () {
        container.innerHTML = '<p class="text-center small" style="color:var(--text-soft);">Feed indisponível no momento — visite nosso Instagram.</p>';
      });
  }

  function formatDate(iso) {
    if (!iso) return '';
    var meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    return p[2] + ' ' + meses[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  toggleMenu();
  renderYear();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderIgFeed);
  } else {
    renderIgFeed();
  }
})();
