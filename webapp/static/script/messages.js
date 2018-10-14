$(document).ready(function(){

  $('.message-header').click(function(){
    $(this).next().slideToggle();
  });

  $('.messages-sidebar li').click(function() {
    $('.messages-sidebar li').removeClass('active');
    $(this).addClass('active');
    $('.message-table').hide();

    var target_div = $(this).attr("data-target");
    $(target_div).show();
  });

  $('.reply-button').click(function() {
    var reply_form = $(this).next('.reply-form');
    $(reply_form).show();
    $(reply_form).focus();

    $(this).hide();
    return false;
  });

});
