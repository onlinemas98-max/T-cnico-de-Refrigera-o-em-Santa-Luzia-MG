/* ==========================================================================
   Técnico de Refrigeração em Santa Luzia MG — Script Principal (Leve e Direto)
   - Menu responsivo acessível
   - Rastreamento de cliques no WhatsApp (somente clique real, com deduplicação)
   - Rastreamento de início e envio de formulário (sem duplicidade)
   - Envio real para API configurável (sem simulações falsas)
   ========================================================================== */

(function () {
  "use strict";

  function getApiBase() {
    if (typeof window.REFRIGERACAO_API_BASE === "string" && window.REFRIGERACAO_API_BASE.trim()) {
      return window.REFRIGERACAO_API_BASE.trim().replace(/\/+$/, "");
    }
    var meta = document.querySelector('meta[name="api-base"]');
    if (meta && meta.getAttribute("content")) {
      return meta.getAttribute("content").trim().replace(/\/+$/, "");
    }
    try {
      var saved = localStorage.getItem("rsl_api_base");
      if (saved && saved.trim()) {
        return saved.trim().replace(/\/+$/, "");
      }
    } catch (_e) {}
    return "";
  }

  function isStaticWithoutApi(apiBase) {
    if (window.location.protocol === "file:" && !apiBase) {
      return true;
    }
    return false;
  }

  function getCurrentPageInfo() {
    return {
      pagePath: window.location.pathname || "/",
      pageTitle: document.title || ""
    };
  }

  function sendTrackEvent(payload) {
    var apiBase = getApiBase();
    if (isStaticWithoutApi(apiBase)) {
      return;
    }
    var url = apiBase + "/api/track";
    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) {
          return;
        }
      } catch (_err) {
        // Fallback para fetch
      }
    }

    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true
      }).catch(function () {});
    } catch (_err2) {
      // Falha silenciosa em rastreamento não bloqueia navegação
    }
  }

  function initMobileMenu() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var nav = document.querySelector("[data-main-nav]");
    if (!toggle || !nav) {
      return;
    }

    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (expanded) {
        nav.classList.remove("is-open");
      } else {
        nav.classList.add("is-open");
      }
    });
  }

  function initWhatsAppTracking() {
    var links = document.querySelectorAll('a[href^="https://wa.me/"]');
    if (!links.length) {
      return;
    }

    var lastTrackedAt = 0;

    links.forEach(function (link) {
      link.addEventListener("click", function () {
        var now = Date.now();
        if (now - lastTrackedAt < 1800) {
          return;
        }
        lastTrackedAt = now;

        var info = getCurrentPageInfo();
        sendTrackEvent({
          eventType: "whatsapp_click",
          pagePath: info.pagePath,
          pageTitle: info.pageTitle,
          placement: link.getAttribute("data-wa-placement") || "pagina",
          contextLabel: link.getAttribute("data-wa-context") || ""
        });
      });
    });
  }

  function setFormFeedback(box, type, htmlContent) {
    if (!box) {
      return;
    }
    box.className = "form-feedback is-visible " + type;
    box.innerHTML = htmlContent;
  }

  function initQuoteForms() {
    var forms = document.querySelectorAll("form[data-quote-form]");
    if (!forms.length) {
      return;
    }

    forms.forEach(function (form) {
      var started = false;
      var submitting = false;
      var feedback = form.querySelector("[data-form-feedback]");
      var submitBtn = form.querySelector('button[type="submit"]');

      function markFormStart(target) {
        if (started || !target) {
          return;
        }
        if (target.name === "website" || target.type === "hidden") {
          return;
        }
        started = true;
        var info = getCurrentPageInfo();
        sendTrackEvent({
          eventType: "form_start",
          pagePath: info.pagePath,
          pageTitle: info.pageTitle,
          placement: "formulario_orcamento"
        });
      }

      form.addEventListener("focusin", function (event) {
        markFormStart(event.target);
      });

      form.addEventListener("change", function (event) {
        markFormStart(event.target);
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        if (submitting) {
          return;
        }

        var honeypot = form.querySelector('input[name="website"]');
        if (honeypot && honeypot.value.trim() !== "") {
          return;
        }

        var nameInput = form.querySelector('[name="name"]');
        var phoneInput = form.querySelector('[name="phone"]');
        var neighborhoodInput = form.querySelector('[name="neighborhood"]');
        var equipmentInput = form.querySelector('[name="equipment"]');
        var serviceInput = form.querySelector('[name="service"]');
        var messageInput = form.querySelector('[name="message"]');
        var consentInput = form.querySelector('[name="consent"]');

        var nameVal = nameInput ? nameInput.value.trim() : "";
        var phoneVal = phoneInput ? phoneInput.value.trim() : "";
        var neighborhoodVal = neighborhoodInput ? neighborhoodInput.value.trim() : "";
        var equipmentVal = equipmentInput ? equipmentInput.value.trim() : "";
        var serviceVal = serviceInput ? serviceInput.value.trim() : "";
        var messageVal = messageInput ? messageInput.value.trim() : "";
        var consentChecked = consentInput ? consentInput.checked : false;

        if (nameVal.length < 2) {
          setFormFeedback(feedback, "is-error", "Informe seu nome completo para solicitar o orçamento.");
          if (nameInput) nameInput.focus();
          return;
        }

        var digits = phoneVal.replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 13) {
          setFormFeedback(feedback, "is-error", "Informe um número de telefone ou WhatsApp válido com DDD.");
          if (phoneInput) phoneInput.focus();
          return;
        }

        if (!neighborhoodVal) {
          setFormFeedback(feedback, "is-error", "Selecione ou informe o bairro do atendimento em Santa Luzia.");
          if (neighborhoodInput) neighborhoodInput.focus();
          return;
        }

        if (!equipmentVal) {
          setFormFeedback(feedback, "is-error", "Selecione o tipo de equipamento de refrigeração.");
          if (equipmentInput) equipmentInput.focus();
          return;
        }

        if (!serviceVal) {
          setFormFeedback(feedback, "is-error", "Selecione o serviço desejado.");
          if (serviceInput) serviceInput.focus();
          return;
        }

        if (messageVal.length < 8) {
          setFormFeedback(feedback, "is-error", "Descreva brevemente o problema ou necessidade do equipamento.");
          if (messageInput) messageInput.focus();
          return;
        }

        if (!consentChecked) {
          setFormFeedback(feedback, "is-error", "É necessário concordar com a Política de Privacidade para enviar a solicitação.");
          if (consentInput) consentInput.focus();
          return;
        }

        var apiBase = getApiBase();
        if (isStaticWithoutApi(apiBase)) {
          setFormFeedback(
            feedback,
            "is-warn",
            "Este formulário requer conexão com o servidor de atendimento configurado. Para agilizar agora mesmo, clique no botão <strong>Orçamento pelo WhatsApp</strong> nesta página."
          );
          return;
        }

        submitting = true;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Enviando solicitação...";
        }

        var info = getCurrentPageInfo();
        var payload = {
          name: nameVal,
          phone: phoneVal,
          neighborhood: neighborhoodVal,
          equipment: equipmentVal,
          service: serviceVal,
          message: messageVal,
          consent: true,
          website: "",
          pagePath: info.pagePath,
          pageTitle: info.pageTitle
        };

        fetch(apiBase + "/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
          .then(function (response) {
            if (!response.ok) {
              return response.json().catch(function () {
                return { error: "Não foi possível registrar o orçamento no servidor." };
              }).then(function (data) {
                throw new Error(data.error || "Erro HTTP " + response.status);
              });
            }
            return response.json();
          })
          .then(function () {
            form.reset();
            started = false;
            setFormFeedback(
              feedback,
              "is-success",
              "Solicitação registrada com sucesso! Se preferir agilizar o atendimento, você também pode iniciar a conversa pelo botão de WhatsApp."
            );
          })
          .catch(function (err) {
            var reason = err && err.message && err.message !== "Failed to fetch" ? err.message : "servidor não conectado";
            setFormFeedback(
              feedback,
              "is-warn",
              "Não foi possível enviar ao servidor neste ambiente (" +
                reason +
                "). Para atendimento imediato, utilize o botão <strong>Orçamento pelo WhatsApp</strong>."
            );
          })
          .finally(function () {
            submitting = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Solicitar orçamento";
            }
          });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMobileMenu();
    initWhatsAppTracking();
    initQuoteForms();
  });
})();
