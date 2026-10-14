/**
 * app.js
 * Orquestador principal de la aplicación electoral.
 * Integra los módulos de Votación, Auditoría, Accesibilidad y Principios de Usabilidad de Nielsen.
 */

const App = {
    currentStep: 1,
    activeVoterDoc: "",
    selectedCandidate: null,
    activeTab: "votante", // 'votante' | 'mesa' | 'tribunal' | 'nielsen'
    resetTimer: null,
    countdownSeconds: 12,

    init() {
        this.renderCandidates();
        this.bindEvents();
        this.bindKeypad();
        Accessibility.init();
        this.updateStepView();
        this.updateMesaStats();
    },

    /**
     * Renderiza las tarjetas de candidatos en la pantalla de votación (Paso 2).
     */
    renderCandidates() {
        const grid = document.getElementById("candidates-grid");
        if (!grid) return;

        grid.innerHTML = "";

        CANDIDATES.forEach((cand, index) => {
            const card = document.createElement("article");
            card.className = "candidate-card";
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            card.setAttribute("aria-pressed", "false");
            card.setAttribute("data-candidate-id", cand.id);
            card.style.setProperty("--brand-color", cand.colorTheme);

            const isBlank = cand.id === "blank";

            card.innerHTML = `
                <div class="card-badge" style="background-color: ${cand.badgeColor}">
                    ${isBlank ? "OPCIÓN OFICIAL" : `LISTA ${cand.number}`}
                </div>
                <div class="card-image-wrap">
                    <img src="${cand.photo}" alt="Fotografía de ${cand.name}" class="candidate-photo" loading="lazy">
                </div>
                <div class="card-body">
                    <h3 class="candidate-name">${cand.name}</h3>
                    <p class="candidate-party">${cand.party}</p>
                    <p class="candidate-slogan">"${cand.slogan}"</p>
                    
                    <ul class="candidate-proposals" aria-label="Propuestas principales">
                        ${cand.proposals.map(p => `<li>${p}</li>`).join("")}
                    </ul>
                </div>
                <div class="card-footer">
                    <span class="selection-indicator" aria-hidden="true">
                        <span class="indicator-icon">✓</span>
                        <span class="indicator-text">Seleccionar</span>
                    </span>
                    <span class="shortcut-pill" title="Atajo de teclado">[ ${index + 1} ]</span>
                </div>
            `;

            // Selección con clic o tecla Enter/Espacio
            const selectAction = () => this.selectCandidate(cand, card);
            card.addEventListener("click", selectAction);
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectAction();
                }
            });

            grid.appendChild(card);
        });
    },

    /**
     * Asocia todos los eventos de interacción de la interfaz.
     */
    bindEvents() {
        // --- Paso 1: Identificación ---
        const btnVerify = document.getElementById("btn-verify-voter");
        const inputDoc = document.getElementById("input-voter-doc");

        if (btnVerify && inputDoc) {
            btnVerify.addEventListener("click", () => this.handleVerifyVoter());
            inputDoc.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.handleVerifyVoter();
                }
            });
        }

        // Botones de presets rápidos para testing
        document.querySelectorAll(".btn-preset-doc").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const doc = e.currentTarget.getAttribute("data-doc");
                if (doc === "random") {
                    const rnd = Math.floor(30000000 + Math.random() * 15000000);
                    inputDoc.value = rnd.toString();
                } else {
                    inputDoc.value = doc;
                }
                NielsenFeedback.playSound('select');
                inputDoc.focus();
            });
        });

        // --- Paso 2: Selección ---
        const btnGoToReview = document.getElementById("btn-goto-review");
        if (btnGoToReview) {
            btnGoToReview.addEventListener("click", () => {
                if (this.selectedCandidate) {
                    this.goToStep(3);
                } else {
                    NielsenFeedback.showToast("Por favor seleccione un candidato o Voto en Blanco antes de continuar.", "warning");
                }
            });
        }

        const btnCancelSelection = document.getElementById("btn-cancel-step2");
        if (btnCancelSelection) {
            btnCancelSelection.addEventListener("click", () => {
                this.goToStep(1);
                NielsenFeedback.showToast("Sesión de votación cancelada.", "info");
            });
        }

        // --- Paso 3: Revisión y Confirmación ---
        // BOTÓN DESHACER (Requisito clave: Advertencia explícita al deshacer)
        const btnUndoVote = document.getElementById("btn-undo-vote");
        if (btnUndoVote) {
            btnUndoVote.addEventListener("click", () => {
                NielsenFeedback.showUndoWarningModal(
                    this.selectedCandidate,
                    // Si confirma deshacer:
                    () => {
                        this.selectedCandidate = null;
                        this.clearSelectionVisuals();
                        this.goToStep(2);
                    },
                    // Si cancela deshacer:
                    () => {
                        NielsenFeedback.showToast("Continuando con la revisión de su elección.", "info");
                    }
                );
            });
        }

        // BOTÓN CONFIRMAR Y EMITIR VOTO
        const btnConfirmVote = document.getElementById("btn-confirm-final-vote");
        if (btnConfirmVote) {
            btnConfirmVote.addEventListener("click", () => this.handleCastVote());
        }

        // --- Paso 4: Finalización ---
        const btnFinish = document.getElementById("btn-finish-vote");
        if (btnFinish) {
            btnFinish.addEventListener("click", () => this.resetVoterFlow());
        }

        // --- Pestañas y Roles de Participantes ---
        document.querySelectorAll(".nav-tab-btn").forEach(tabBtn => {
            tabBtn.addEventListener("click", (e) => {
                const targetTab = e.currentTarget.getAttribute("data-tab");
                this.switchTab(targetTab);
            });
        });

        // Controles de Mesa / Tribunal
        const btnToggleTable = document.getElementById("btn-toggle-table-state");
        if (btnToggleTable) {
            btnToggleTable.addEventListener("click", () => {
                const newState = ElectionStore.toggleTableState();
                NielsenFeedback.showToast(
                    newState ? "La mesa electoral ha sido ABIERTA." : "La mesa electoral ha sido CERRADA por el Tribunal.",
                    newState ? "success" : "warning"
                );
                this.updateMesaStats();
            });
        }

        const btnResetDemo = document.getElementById("btn-reset-demo");
        if (btnResetDemo) {
            btnResetDemo.addEventListener("click", () => {
                if (confirm("¿Desea restablecer todos los votos de la demostración para comenzar de cero?")) {
                    ElectionStore.resetDemo();
                    NielsenFeedback.showToast("Demostración restablecida con éxito.", "info");
                    this.updateMesaStats();
                    this.resetVoterFlow();
                }
            });
        }
    },

    /**
     * Teclado numérico virtual para quioscos accesibles.
     */
    bindKeypad() {
        const inputDoc = document.getElementById("input-voter-doc");
        if (!inputDoc) return;

        document.querySelectorAll(".keypad-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const key = e.currentTarget.getAttribute("data-key");
                NielsenFeedback.playSound('select');

                if (key === "clear") {
                    inputDoc.value = "";
                } else if (key === "backspace") {
                    inputDoc.value = inputDoc.value.slice(0, -1);
                } else {
                    if (inputDoc.value.length < 10) {
                        inputDoc.value += key;
                    }
                }
                inputDoc.focus();
            });
        });
    },

    /**
     * Valida la habilitación del votante y su unicidad.
     */
    async handleVerifyVoter() {
        const inputDoc = document.getElementById("input-voter-doc");
        const docValue = inputDoc ? inputDoc.value.trim() : "";

        if (!docValue) {
            NielsenFeedback.showToast("Por favor, ingrese un número de documento válido.", "warning");
            inputDoc.focus();
            return;
        }

        // Feedback de verificación en curso
        const btnVerify = document.getElementById("btn-verify-voter");
        btnVerify.disabled = true;
        btnVerify.innerHTML = `Verificando en padrón anónimo...`;

        const check = await ElectionStore.checkVoter(docValue);

        btnVerify.disabled = false;
        btnVerify.innerHTML = `Ingresar al Cuarto Oscuro &rarr;`;

        if (!check.allowed) {
            NielsenFeedback.showToast(check.reason, "error", 6000);
            return;
        }

        // Votante habilitado
        this.activeVoterDoc = docValue;
        NielsenFeedback.showToast("Votante habilitado. CERO datos personales almacenados en sistema.", "success");
        this.goToStep(2);
    },

    /**
     * Maneja la selección visual de una boleta.
     */
    selectCandidate(candidate, cardElement) {
        this.selectedCandidate = candidate;
        NielsenFeedback.playSound('select');

        // Actualizar estados visuales de las tarjetas
        document.querySelectorAll(".candidate-card").forEach(c => {
            c.classList.remove("selected");
            c.setAttribute("aria-pressed", "false");
            const indicatorText = c.querySelector(".indicator-text");
            if (indicatorText) indicatorText.textContent = "Seleccionar";
        });

        cardElement.classList.add("selected");
        cardElement.setAttribute("aria-pressed", "true");
        const activeText = cardElement.querySelector(".indicator-text");
        if (activeText) activeText.textContent = "Seleccionado";

        // Habilitar botón de continuar a revisión
        const btnGoToReview = document.getElementById("btn-goto-review");
        if (btnGoToReview) {
            btnGoToReview.disabled = false;
            btnGoToReview.classList.remove("btn-disabled");
            btnGoToReview.focus();
        }

        NielsenFeedback.showToast(`Ha seleccionado: ${candidate.name}`, "info", 2000);
    },

    clearSelectionVisuals() {
        document.querySelectorAll(".candidate-card").forEach(c => {
            c.classList.remove("selected");
            c.setAttribute("aria-pressed", "false");
            const indicatorText = c.querySelector(".indicator-text");
            if (indicatorText) indicatorText.textContent = "Seleccionar";
        });

        const btnGoToReview = document.getElementById("btn-goto-review");
        if (btnGoToReview) {
            btnGoToReview.disabled = true;
            btnGoToReview.classList.add("btn-disabled");
        }
    },

    /**
     * Emite el voto final tras la pantalla de revisión.
     */
    async handleCastVote() {
        if (!this.activeVoterDoc || !this.selectedCandidate) {
            NielsenFeedback.showToast("Error de sesión: Datos de votación incompletos.", "error");
            this.goToStep(1);
            return;
        }

        const btnConfirm = document.getElementById("btn-confirm-final-vote");
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `Depositando en urna digital...`;

        const result = await ElectionStore.castVote(this.activeVoterDoc, this.selectedCandidate.id);

        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `Confirmar e Ingresar a Urna &check;`;

        if (result.success) {
            NielsenFeedback.playSound('confirm');
            this.showReceiptScreen(result.receipt);
            this.goToStep(4);
            this.updateMesaStats();
        } else {
            NielsenFeedback.showToast(result.message || "No fue posible registrar el voto.", "error");
        }
    },

    /**
     * Muestra la pantalla de comprobante anónimo y temporizador seguro de limpieza.
     */
    showReceiptScreen(receiptCode) {
        const receiptElem = document.getElementById("receipt-token-display");
        if (receiptElem) {
            receiptElem.textContent = receiptCode;
        }

        // Iniciar temporizador de reseteo para el siguiente votante
        if (this.resetTimer) clearInterval(this.resetTimer);
        this.countdownSeconds = 12;
        
        const countdownSpan = document.getElementById("reset-countdown");
        if (countdownSpan) countdownSpan.textContent = this.countdownSeconds.toString();

        this.resetTimer = setInterval(() => {
            this.countdownSeconds--;
            if (countdownSpan) countdownSpan.textContent = this.countdownSeconds.toString();

            if (this.countdownSeconds <= 0) {
                clearInterval(this.resetTimer);
                this.resetVoterFlow();
            }
        }, 1000);
    },

    /**
     * Limpia la sesión del votante para el siguiente elector.
     */
    resetVoterFlow() {
        if (this.resetTimer) clearInterval(this.resetTimer);
        this.activeVoterDoc = "";
        this.selectedCandidate = null;
        
        const inputDoc = document.getElementById("input-voter-doc");
        if (inputDoc) inputDoc.value = "";

        this.clearSelectionVisuals();
        this.goToStep(1);
        NielsenFeedback.showToast("Mesa lista para el siguiente votante.", "info");
    },

    /**
     * Cambia de paso en el flujo de votación con transición y actualización de barra de pasos.
     */
    goToStep(stepNumber) {
        this.currentStep = stepNumber;
        this.updateStepView();

        if (stepNumber === 3) {
            this.renderReviewSummary();
        }
    },

    /**
     * Actualiza la visibilidad de pantallas y los indicadores de paso (Heurística #1).
     */
    updateStepView() {
        // Ocultar todos los pasos y mostrar solo el activo
        document.querySelectorAll(".step-panel").forEach(panel => {
            panel.classList.add("hidden");
            panel.setAttribute("aria-hidden", "true");
        });

        const activePanel = document.getElementById(`step-${this.currentStep}`);
        if (activePanel) {
            activePanel.classList.remove("hidden");
            activePanel.setAttribute("aria-hidden", "false");
        }

        // Actualizar barra de progreso de pasos
        document.querySelectorAll(".stepper-item").forEach(item => {
            const stepNum = parseInt(item.getAttribute("data-step"), 10);
            item.classList.remove("active", "completed");

            if (stepNum === this.currentStep) {
                item.classList.add("active");
                item.setAttribute("aria-current", "step");
            } else if (stepNum < this.currentStep) {
                item.classList.add("completed");
                item.removeAttribute("aria-current");
            } else {
                item.removeAttribute("aria-current");
            }
        });

        window.scrollTo({ top: 0, behavior: "smooth" });
    },

    /**
     * Renderiza el resumen visual en el Paso 3 (Reconocimiento antes que recuerdo).
     */
    renderReviewSummary() {
        const container = document.getElementById("review-summary-card");
        if (!container || !this.selectedCandidate) return;

        const cand = this.selectedCandidate;
        const isBlank = cand.id === "blank";

        container.innerHTML = `
            <div class="review-card-inner" style="border-top: 6px solid ${cand.colorTheme}">
                <div class="review-image-col">
                    <img src="${cand.photo}" alt="${cand.name}" class="review-photo">
                </div>
                <div class="review-details-col">
                    <span class="review-badge" style="background-color: ${cand.badgeColor}">
                        ${isBlank ? "OPCIÓN OFICIAL" : `LISTA ${cand.number}`}
                    </span>
                    <h2 class="review-name">${cand.name}</h2>
                    <p class="review-party">${cand.party}</p>
                    <p class="review-slogan">"${cand.slogan}"</p>
                    <div class="review-alert-box">
                        <span class="review-alert-icon">ℹ️</span>
                        <span>Verifique que sea la opción deseada. Podrá deshacer su voto si desea cambiarlo.</span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Cambia entre pestañas de Votante, Mesa de Autoridades, Tribunal y Heurísticas Nielsen.
     */
    switchTab(tabId) {
        this.activeTab = tabId;

        document.querySelectorAll(".nav-tab-btn").forEach(btn => {
            const isTarget = btn.getAttribute("data-tab") === tabId;
            btn.classList.toggle("active", isTarget);
            btn.setAttribute("aria-selected", isTarget.toString());
        });

        document.querySelectorAll(".tab-content-section").forEach(sec => {
            sec.classList.add("hidden");
            sec.setAttribute("aria-hidden", "true");
        });

        const targetSec = document.getElementById(`tab-content-${tabId}`);
        if (targetSec) {
            targetSec.classList.remove("hidden");
            targetSec.setAttribute("aria-hidden", "false");
        }

        NielsenFeedback.playSound('select');

        if (tabId === "mesa" || tabId === "tribunal") {
            this.updateMesaStats();
        }
    },

    /**
     * Actualiza las estadísticas y datos de auditoría de la mesa.
     */
    updateMesaStats() {
        const results = ElectionStore.getResults();

        // 1. Estadísticas numéricas
        const statTotal = document.getElementById("stat-total-votes");
        const statTurnout = document.getElementById("stat-turnout-pct");
        const statRemaining = document.getElementById("stat-roll-size");
        const statHashed = document.getElementById("stat-hashed-voters");
        const tableStatusBadge = document.getElementById("table-status-badge");
        const btnToggleTable = document.getElementById("btn-toggle-table-state");

        if (statTotal) statTotal.textContent = results.totalVotes.toString();
        if (statTurnout) statTurnout.textContent = `${results.turnoutPercentage}%`;
        if (statRemaining) statRemaining.textContent = results.electoralRollSize.toString();
        if (statHashed) statHashed.textContent = results.hashedVotersCount.toString();

        if (tableStatusBadge) {
            tableStatusBadge.textContent = results.isOpen ? "MESA ABIERTA" : "MESA CERRADA";
            tableStatusBadge.className = `status-pill ${results.isOpen ? "status-open" : "status-closed"}`;
        }

        if (btnToggleTable) {
            btnToggleTable.textContent = results.isOpen ? "Cerrar Mesa Electoral" : "Reabrir Mesa Electoral";
            btnToggleTable.className = `btn ${results.isOpen ? "btn-danger" : "btn-primary"}`;
        }

        // 2. Gráfico de barras de escrutinio
        const resultsContainer = document.getElementById("scrutiny-results-bars");
        if (resultsContainer) {
            resultsContainer.innerHTML = "";
            results.breakdown.forEach(item => {
                const row = document.createElement("div");
                row.className = "scrutiny-bar-row";
                row.innerHTML = `
                    <div class="scrutiny-label">
                        <strong>${item.name}</strong> (${item.party})
                        <span class="scrutiny-count">${item.votes} votos (${item.percentage}%)</span>
                    </div>
                    <div class="scrutiny-bar-track">
                        <div class="scrutiny-bar-fill" style="width: ${item.percentage}%; background-color: ${item.colorTheme}"></div>
                    </div>
                `;
                resultsContainer.appendChild(row);
            });
        }

        // 3. Padrón de Hashes Anónimos (Demostración de CERO datos personales)
        const hashesList = document.getElementById("hashes-audit-list");
        if (hashesList) {
            const state = ElectionStore.getState();
            hashesList.innerHTML = "";
            if (state.hashedVoters.length === 0) {
                hashesList.innerHTML = `<li class="empty-list-note">Aún no se han registrado sufragios en esta mesa.</li>`;
            } else {
                state.hashedVoters.forEach((hash, idx) => {
                    const li = document.createElement("li");
                    li.className = "hash-item";
                    li.innerHTML = `
                        <span class="hash-index">#${idx + 1}</span>
                        <code class="hash-code">${hash}</code>
                        <span class="hash-badge">Voto único registrado (Sin datos personales)</span>
                    `;
                    hashesList.appendChild(li);
                });
            }
        }

        // 4. Urna Desacoplada (Tribunal)
        const ballotsList = document.getElementById("ballots-audit-list");
        if (ballotsList) {
            const state = ElectionStore.getState();
            ballotsList.innerHTML = "";
            if (state.ballotBox.length === 0) {
                ballotsList.innerHTML = `<li class="empty-list-note">La urna digital está vacía.</li>`;
            } else {
                state.ballotBox.forEach((b, idx) => {
                    const cand = CANDIDATES.find(c => c.id === b.candidateId);
                    const li = document.createElement("li");
                    li.className = "ballot-audit-item";
                    li.innerHTML = `
                        <span class="ballot-id">Token: <strong>${b.receiptId}</strong></span>
                        <span class="ballot-choice" style="color: ${cand ? cand.colorTheme : '#333'}">
                            Opción: <strong>${cand ? cand.name : b.candidateId}</strong>
                        </span>
                        <span class="ballot-time">${new Date(b.timestamp).toLocaleTimeString()}</span>
                    `;
                    ballotsList.appendChild(li);
                });
            }
        }
    }
};

// Inicializar la aplicación cuando el DOM esté cargado
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});
