// eslint-disable-next-line no-unused-vars
import Inputmask from "inputmask";
import "./lib/checkProgImages";
import "./lib/video";
import scrollToTop from "./lib/scrollToTop";
// import scrollTable from './lib/scrollTable';
import changeDefaultTextTooltip from "./lib/changeDefaultTextTooltip";

scrollToTop();
// scrollTable();

//  input mask
const input = document.querySelectorAll('input[type="tel"]');
// eslint-disable-next-line no-undef
const im = new Inputmask("+375 (99) 999-99-99");
im.mask(input);

// change default text tooltip input field
const inputPhone = document.querySelector('input[name="phone"]');
changeDefaultTextTooltip(inputPhone);

// dispatchMessage
$("form").on("submit", (e) => {
  e.preventDefault();
  $.ajax({
    type: "POST",
    url: "mailer/smart.php",
    data: $(this).serialize(),
  }).done(() => {
    $(this).find("input").val("");

    $(".overlay").fadeIn(700);

    setTimeout(() => {
      $(".overlay").fadeOut(500);
    }, 5000);

    $("form").trigger("reset");
  });
  return false;
});

$(".modal__close").on("click", () => {
  $(".overlay").fadeOut(500);
});
