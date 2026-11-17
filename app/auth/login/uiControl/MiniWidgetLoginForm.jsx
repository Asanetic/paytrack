// File: Components/Auth/LoginLayout.js
'use client';

import React from 'react';
import MainLoginInputs from './MainLoginInputs'

// One full-height flex container centres the whole card (logo, inputs, button) both ways on every screen size.
export default function MiniWidgetLoginForm(
{
  loginBgImg = '',
  appLogo = '',
  appName = 'App',
  showResetLink = false,
  changePasswordUrl = '#',
  showCreateAccount = false,
  registerUrl = '#',
}
) {
  return (
    <div className="login-page"
      style={{ backgroundImage: `url('${loginBgImg}')`, backgroundRepeat: "no-repeat", backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="login-overlay">
        {/* "login-wrapper" keeps the theme's white card styling for .loginbox */}
        <div className="login-wrapper">
          <div className="login-col">
            <div className="loginbox p-0 m-0">
              <div className="login-right text-dark">
                <div className="login-right-wrap">
                  <div className="col-md-12 p-0">
                    {/* Slot in login form or child content */}
                    <MainLoginInputs
                      showCreateAccount={showCreateAccount}
                      appName={appName}
                      appLogo={appLogo}
                      showResetLink={showResetLink}
                      changePasswordUrl={changePasswordUrl}
                      registerUrl={registerUrl} />
                  </div>
                  <div className="pt-3" id="alert_box" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped styles for this component */}
      <style jsx>{`
        .login-page {
          min-height: 100vh;
          min-height: 100dvh; /* mobile browsers: ignore the collapsing address bar */
          width: 100%;
          display: flex;
        }

        .login-overlay {
          flex: 1;
          display: flex;
          align-items: center;      /* vertical centre */
          justify-content: center;  /* horizontal centre */
          padding: 16px;
          background-color: rgba(255, 255, 255, 0.5);
        }

        /* the theme gives .login-wrapper a table-cell layout; undo it so flex centring wins */
        .login-wrapper {
          display: block !important;
          width: 100%;
          height: auto !important;
        }

        .login-col {
          width: 100%;
          max-width: 440px;
          margin: 0 auto;
        }

        .form-control {
          background-color: transparent !important;
        }

        .loginbox {
          max-width: 100% !important;
          margin: 0 auto !important; /* the theme's 1.875rem top/bottom margin would push it off-centre */
          min-height: 0 !important;
        }

        /* an empty alert box must not add space under the button */
        #alert_box:empty {
          display: none;
        }
      `}</style>
    </div>
  );
}
