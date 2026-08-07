// cookie-banner.js
(function() {
    // 1. Create the Styles
    const style = document.createElement('style');
    style.innerHTML = `
        #tdpsa-popup {
            position: fixed; bottom: 20px; right: 20px; width: 320px;
            background: #fff; border: 1px solid #ccc; padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;
            font-family: sans-serif; font-size: 14px; border-radius: 8px;
        }
        #tdpsa-popup p { margin: 0 0 15px 0; line-height: 1.4; }
        .tdpsa-btns { display: flex; gap: 10px; }
        .tdpsa-btn { flex: 1; padding: 8px; cursor: pointer; border: none; border-radius: 4px; }
        .btn-accept { background: #000; color: #fff; }
        .btn-reject { background: #eee; color: #000; }
    `;
    document.head.appendChild(style);

    // 2. Create the HTML
    const popup = document.createElement('div');
    popup.id = 'tdpsa-popup';
    popup.innerHTML = `
        <p>We use cookies to analyze traffic. By continuing, you agree to our use of cookies per the TDPSA.</p>
        <div class="tdpsa-btns">
            <button class="tdpsa-btn btn-reject" id="tdpsa-reject">Reject</button>
            <button class="tdpsa-btn btn-accept" id="tdpsa-accept">Accept</button>
        </div>
    `;

    // 3. Logic
    if (!localStorage.getItem('tdpsa_consent')) {
        document.body.appendChild(popup);
        
        document.getElementById('tdpsa-accept').onclick = () => {
            localStorage.setItem('tdpsa_consent', 'true');
            popup.remove();
        };
        
        document.getElementById('tdpsa-reject').onclick = () => {
            localStorage.setItem('tdpsa_consent', 'false');
            popup.remove();
        };
    }
})();