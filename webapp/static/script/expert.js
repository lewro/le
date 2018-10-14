$(document).ready(function(){

  setTimeout(function(){
    $('.message_box').slideUp();
  }, 1500);

  $('.expert-sidebar li').click(function(){
    var target = $(this).attr("data-target");

    $([document.documentElement, document.body]).animate({
      scrollTop: $(target).offset().top
    }, 1000);

    $('.expert-sidebar li').removeClass('active');
    $(this).addClass('active');
  });

  $('#send-message').click(function(){
    $('.message-sidebar').toggle("slide");
    return false;
  });

  $('#send-rating').click(function(){
    $('.rating-sidebar').toggle("slide");
    return false;
  });

  $('.close-sideber').click(function(){
    $('.sidebar').hide();
  });

  $('.star-rating .far').hover(function(){
    $(this).next('.far').removeClass('active');
    $(this).next('.far').next('.far').removeClass('active');
    $(this).next('.far').next('.far').next('.far').removeClass('active');
    $(this).next('.far').next('.far').next('.far').next('.far').removeClass('active');
    $(this).addClass('active');
    $(this).prev('.far').addClass('active');
    $(this).prev('.far').prev('.far').addClass('active');
    $(this).prev('.far').prev('.far').prev('.far').addClass('active');
    $(this).prev('.far').prev('.far').prev('.far').prev('.far').addClass('active');
  });

  $('.star-rating .far').click(function(){
    var rating = $(this).attr('data-value');
    $('#id_rating').val(rating);
  });

});

