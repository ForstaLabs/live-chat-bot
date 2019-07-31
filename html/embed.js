//DEPS
window.jQuery ||
  (() => {
    var jqueryScriptElement = document.createElement("script");
    jqueryScriptElement.setAttribute(
      "src",
      "https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js"
    );
    document.body.appendChild(jqueryScriptElement);
  })();

//material design css
var materialDesignStylesheetElement = document.createElement("link");
materialDesignStylesheetElement.setAttribute("rel", "stylesheet");
materialDesignStylesheetElement.setAttribute(
  "href",
  "https://code.getmdl.io/1.3.0/material.indigo-blue.min.css"
);
document.body.appendChild(materialDesignStylesheetElement);

//material design javascript
var materialDesignScriptElement = document.createElement("script");
materialDesignScriptElement.setAttribute(
  "src",
  "https://code.getmdl.io/1.3.0/material.min.js"
);
document.body.appendChild(materialDesignScriptElement);

//GLOBAL STATE
var flc = {};
var chatOpen = getCookie("chatOpen") === "true";
var chatOpening = false;
var chatData = {
  firstName: getCookie("firstName"),
  lastName: getCookie("lastName"),
  email: getCookie("email")
};
var isMobileDevice = false;

flc.activate = activate;
flc.initChat = initChat;

////////////////////////

function activate() {
  var styles = getStyles();
  jQuery("body").append(`<style>${styles}</style>`);

  if (jQuery(".site-content") === 0) {
    jQuery(".site-content").append('<div id="forsta-chat-container"></div>');
  } else {
    jQuery(document.body).append('<div id="forsta-chat-container"></div>');
  }

  flc.initChat();
}

function initChat() {
	//mobile detection should be done based on headers, not device width
  // var isMobileDevice = jQuery(window).width() < 992;
	getDesktopButton();
	addDesktopBtnListener();
  addFormListener();
}

function getDesktopButton() {
  var template = `
		<div id="forsta-chat-header" class="mdl-shadow--2dp">
			<table>
				<tr>
					<td>
						<img style="padding:15px" height="120" width="120" src="${
              flc.options.headerLogoUrl
            }" />
					</td>
					<td style="padding-left:10px;padding-top:10px !important">
						<p class="forsta-chat-header-title">${flc.options.title}</p>
						<p class="forsta-chat-header-subtitle">${flc.options.subtitle}</p>
					</td>
				</tr>
			</table>
		</div>
		<div class="forsta-chat mdl-shadow--2dp" id="forsta-chat">
		</div>
						
		<div class="mdl-tooltip mdl-tooltip--left mdl-tooltip--large" data-mdl-for="forsta-chat-desktop">
			${flc.options.openButtonTooltipText}
		</div>
		<a class="forsta-open-chat-btn" id="forsta-chat-desktop">
			<img id="chat-open" width="40" src="${flc.options.openButtonIconUrl}">
			<img id="chat-close" width="25" src="https://chat.forsta.io/client/close.png">
		</a>
		`;

  var form = `
	<form class="forsta-form" id="forsta-form">
		<div style="margin-bottom:10px;margin-top:10px">
			${flc.options.formText}
		</div>
		<div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
			<input id="first-name" class="mdl-textfield__input" type="text">
			<label class="mdl-textfield__label" for="sample1">First Name</label>
		</div>
		
		<div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
			<input id="last-name" class="mdl-textfield__input" type="text">
			<label class="mdl-textfield__label" for="sample1">Last Name</label>
		</div>

		<div class="mdl-textfield mdl-js-textfield mdl-textfield--floating-label">
			<input id="email" class="mdl-textfield__input" type="text">
			<label class="mdl-textfield__label" for="sample1">Email</label>
		</div>

		<div style="margin-bottom:50px"></div>

		<button 
			type="submit" 
			class="forsta-start-chat-button\
				mdl-button mdl-js-button mdl-button--raised mdl-js-ripple-effect">
			<strong>${flc.options.buttonText}</strong>
		</button>
	</form>
`;

  jQuery("#forsta-chat-container").append(template);

  if (chatOpen && chatData.firstName && chatData.lastName && chatData.email) {
    jQuery("#chat-open").hide();
    jQuery("#forsta-chat").append(getIframe(chatData));
  } else if (chatOpen) {
    jQuery("#chat-open").hide();
    jQuery("#forsta-chat").append(form);
  } else {
    jQuery("#forsta-chat").append(form);
    jQuery("#forsta-chat").hide();
    jQuery("#forsta-chat-header").hide();
    jQuery("#chat-close").hide();
  }
}

function addDesktopBtnListener() {
  jQuery("#forsta-chat-desktop").click(function() {
		if(chatOpening) return;
    jQuery("#forsta-chat-desktop").addClass("rotated-image");
    if (!chatOpen) {
      jQuery("#chat-open").hide();
      jQuery("#chat-close").show();
    } else {
      jQuery("#chat-open").show();
      jQuery("#chat-close").hide();
    }

    if (!chatOpen) {
			chatOpening = true;
      jQuery("#forsta-chat").slideToggle("slow", function() {
        jQuery("#forsta-chat-header").slideToggle("slow", function() {
          jQuery("#forsta-chat-desktop").removeClass("rotated-image");
					chatOpening = false;
					chatOpen = !chatOpen;
          setCookie("chatOpen", chatOpen, 1);
        });
      });
    } else {
			chatOpening = true;
      jQuery("#forsta-chat-header").slideToggle("slow", function() {
        jQuery("#forsta-chat").slideToggle("slow", function() {
					jQuery("#forsta-chat-desktop").removeClass("rotated-image");
					chatOpening = false;
          chatOpen = !chatOpen;
          setCookie("chatOpen", chatOpen, 1);
        });
      });
    }
  });
}

function addFormListener() {
  jQuery("#forsta-form").submit(event => {
    event.preventDefault();

    var data = {
      firstName: event.target[0].value,
      lastName: event.target[1].value,
      email: event.target[2].value
    };

    setCookie("firstName", data.firstName, 1);
    setCookie("lastName", data.lastName, 1);
    setCookie("email", data.email, 1);

    jQuery("#forsta-chat").empty();
    jQuery("#forsta-chat").append(getIframe(data));
  });
}

function getCookie(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(";");
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function getIframe(data) {
  var iframeSrc = getIframeSource(data);
  return `<iframe id="forsta-iframe" width="100%" height="100%" src="${iframeSrc}" allow="camera; microphone"></iframe>`;
}

function getIframeSource(data) {
  var iframeSrc = `
				https://app.forsta.io/@embed?
				token=${flc.options.token}&
				first_name=${data.firstName}&
				last_name=${data.lastName}&
				email=${data.email}&
				to=${flc.options.tag}&
				title=Live Chat-${data.firstName}%20${data.lastName}
			`;
  if (flc.options.allowCalling === "true")
    iframeSrc = `${iframeSrc}&allowCalling`;
  if (flc.options.forceScreenShare === "true")
    iframeSrc = `${iframeSrc}&forceScreenShare`;
  return iframeSrc;
}

function getMobileButton() {
  var mobileSrc = getMobileSrc();
  var template = `
		<a class="forsta-open-chat-btn" id="forsta-chat-mobile" href="${mobileSrc}" target="_blank">
			<img id="chat-open" width="50" src="https://chat.forsta.io/client/logo.png">
		</a>
		`;
  jQuery("#forsta-chat-container").append(template);
}

function getMobileSrc() {
  return `
			https://chat.forsta.io/client/mobile.html?
			forceScreenShare=${flc.options.forceScreenShare}&
			colorBackground=${flc.options.backgroundColor}&
			allowCalling=${flc.options.allowCalling}&
			colorText=${flc.options.fontColor}&
			token=${flc.options.token}&
			tag=${flc.options.tag}
		`;
}

function getStyles() {
  return `
		#chat-open {
			margin-top: 17px;
		} 
		#chat-close {
			margin-top: 20px;
		}
		.forsta-chat {
			display: block; 
			position: fixed;
			bottom: 90px;
			right: 90px;
			z-index: 1000;
			width: 400px;
			height: 400px;
			background-color: #ffffff;
			border-radius:0px 0px 10px 10px;
		}
		.forsta-open-chat-btn { 
			background-color: ${flc.options.openButtonColor};
			position: fixed;
			bottom: 20px;
			right: 20px;
			z-index: 1000;
			cursor: pointer;
			outline: none; 
			display:inline-block; 
			width:65px; height:65px; 
			border-radius: 50%; 
			text-align: center;
		}
		#forsta-chat-header {
			background-color: ${flc.options.headerBackgroundColor};
			color: ${flc.options.headerFontColor};
			position: fixed; 
			bottom: 490px; 
			right: 89px; 
			z-index: 1000;
			width: 402px;
			height: 148px;
			background-position: top center;
			background-size: cover;
			background-repeat: no-repeat;
			border-radius:10px 10px 0px 0px;
		}
		.forsta-form {
			margin: 20px 10px 10px 10px;
			text-align:center;
		}
		.forsta-form-group label {
			display: inline-block;
			margin-bottom: .5rem;
		}
		.forsta-form-group .forsta-form-control {
			display: block;
			width: 100%;
			padding: .375rem .75rem;
			font-size: 1rem;
			line-height: 1.5;
			color: #495057;
			background-color: #fff;
			background-clip: padding-box;
			border: 1px solid #ced4da;
			border-radius: .25rem;
			transition: border-color .15s ease-in-out,box-shadow .15s ease-in-out;
		}
		.rotated-image {
			-webkit-transform: rotate(360deg);
			transform: rotate(360deg);
			transition-duration: .5s;
		}
		.forsta-chat-header-title{
			color: ${flc.options.headerFontColor};
			font-size: 2em;
			font-weight: bold;
			margin-bottom:5px !important;
			margin-top:5px !important;
		}
		.forsta-chat-header-subtitle{
			color: ${flc.options.headerFontColor};
			font-size: 1.2em;
			font-weight: bold;
			margin-top:0px !important;
		}
		.forsta-start-chat-button{
			width:80%;
			font-size:1.2em;
			color: ${flc.options.buttonFontColor};
			background-color: ${flc.options.buttonBackgroundColor};
		}
		`;
}

function setCookie(cname, cvalue, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
  var expires = "expires=" + d.toUTCString();
  document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}