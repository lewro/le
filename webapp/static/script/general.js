$(document).ready(function(){

  // Init select drop downs
  $('select').formSelect();

  // Init modal
  $('.modal').modal();

  // Tabs
  $(document).ready(function(){
    $('.tabs').tabs();
  });

  $('label').click(function() {
    $(this).prev('input').focus().click();
    $(this).prev('textarea').focus().click();
  });

  $('.close-fm').click(function() {
    $('.footer-form').hide(250, function() {
      $('.footer-form-btn').show();
    });

  });

  $('.footer-form-btn').click(function() {
    $('.footer-form').show(250);
    $(this).hide()
  });

});
