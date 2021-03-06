# -*- coding: utf-8 -*-
import operator
import datetime

from PIL import Image

from django.shortcuts import render, redirect
from django.http import HttpResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db.models import Q

from webapp.forms import RegistrationForm
from webapp.forms import MessageForm
from webapp.forms import RatingForm

from webapp.models import User
from webapp.models import Expertise
from webapp.models import Message
from webapp.models import Rating
from webapp.models import News
from webapp.models import Interviews

from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.shortcuts import render

from django.conf import settings
from django.contrib import messages
from django.core.mail import send_mail
from django.core.mail import EmailMessage

from django.template import Context
from django.template.loader import render_to_string, get_template


def logout_user(request):
   logout(request)
   return redirect('/')

def lang(request):
  from django.utils import translation
  user_language = request.GET.get('lang')
  translation.activate(user_language)
  request.session[translation.LANGUAGE_SESSION_KEY] = user_language
  return redirect('/')

def index(request):
  just_registered = request.GET.get('just_registered')
  question_sent   = request.GET.get('question_sent')
  expert_removed  = request.GET.get('expert_removed')
  expertieses     = Expertise.objects.all()

  context = {
    'just_registered'   : just_registered,
    'question_sent'     : question_sent,
    'expert_removed'    : expert_removed,
    'expertieses'       : expertieses
  }

  #Redirect if coming from login with next param
  if request.GET.get('next'):
    redirect_url = request.GET.get('next')
    return redirect(redirect_url)
  else:
    return render(request, 'webapp/index.html', context)

def about(request):
  return render(request, 'marketing/about.html')

def press(request):
  return render(request, 'marketing/press.html')

def terms(request):
  return render(request, 'marketing/terms.html')

def privacy(request):
  return render(request, 'marketing/privacy.html')

def clients_details(request):
  return render(request, 'webapp/clients_details.html')

def experts_details(request):
  return render(request, 'webapp/experts_details.html')

def contact(request):
  subject     = "Question from Local Experts"
  question    = request.POST['message']
  email       = request.POST['email']

  message     = email + " : " + question

  from_email  = settings.EMAIL_HOST_USER
  password    = settings.EMAIL_HOST_PASSWORD
  to_list     = ['support@localexperts.cz']

  send_mail(subject, message, from_email, to_list, fail_silently=True)

  return redirect('/webapp/?question_sent=true')

@login_required
def create_rating(request):
  if request.method == 'POST':
    form = RatingForm(request.POST)

    if form.is_valid():
      form.save()

      #Update Expert Rating
      user_id            = request.POST['to_user']
      rating             = request.POST['rating']

      expert             = User.objects.get(id=user_id)
      current_rating     = expert.rating
      new_rating         = (current_rating + float(rating)) / 2
      expert.rating      = new_rating
      expert.save()

      return redirect('/webapp/expert?id='+user_id+'&rating_sent=true')
    else:
      return redirect('/webapp/')

@login_required
def messages(request):
  expert_id              = request.user.id #Current user
  received_message       = Message.objects.filter(to_user=expert_id).order_by('-created_date')
  sent_message           = Message.objects.filter(from_user=expert_id).order_by('-created_date')

  context = {
    'received_message'  : received_message,
    'sent_message'      : sent_message
  }

  return render(request, 'webapp/messages.html', context)


def news(request):
  category_id   = request.GET.get('category_id')
  page          = request.GET.get('page')
  news_per_page = 10

  if category_id:
    news      = News.objects.filter(category_id=category_id).order_by('-created_date')
    experts   = User.objects.filter(category_id=category_id).order_by('?')[:5]
  else:
    news      = News.objects.all().order_by('-created_date')
    experts   = User.objects.all().order_by('?')[:5]

  paginator = Paginator(news, news_per_page)

  try:
    news = paginator.page(page)
  except PageNotAnInteger:
    news = paginator.page(1)
  except EmptyPage:
    news = paginator.page(paginator.num_pages)

  context = {
    'news'        : news,
    'experts'     : experts,
    'category_id' : category_id
  }
  return render(request, 'webapp/news.html', context)

def interviews(request):
  page                =  request.GET.get('page')
  interviews_per_page = 10

  interviews      = Interviews.objects.all().order_by('-created_date')
  paginator       = Paginator(interviews, interviews_per_page)

  try:
    interviews = paginator.page(page)
  except PageNotAnInteger:
    interviews = paginator.page(1)
  except EmptyPage:
    interviews = paginator.page(paginator.num_pages)

  context = {
    'interviews' : interviews
  }
  return render(request, 'webapp/interviews.html', context)


@login_required
def create_message(request):

  if request.method == 'POST':
    form           = MessageForm(request.POST)
    user_id        = request.POST['to_user']
    from_user_id   = request.POST['from_user']
    expert         = User.objects.get(id=user_id)
    from_user      = User.objects.get(id=from_user_id)

    if form.is_valid():
      form.save()

      now           = datetime.datetime.now()
      replied_id    = form.cleaned_data['replied_message']
      subject       = "Local Experts: " + from_user.email
      body       = request.POST['body']
      from_email    = from_user.email
      to_list       = [expert.email]
      bcc           = ['support@localexperts.cz']

      ctx = {
        'email'   : from_email,
        'body'    : body,
      }

      message = get_template('email/user_message.html').render(ctx)

      msg = EmailMessage(
        subject,
        message,
        from_email,
        to_list,
        bcc,
        reply_to=[from_email]
      )

      msg.content_subtype = "html"
      msg.send()

      if replied_id > 0:
        replied_message = Message.objects.get(id=replied_id)
        replied_message.replied_date = now
        replied_message.status = 2
        replied_message.save()
      return redirect('/webapp/expert?id='+user_id+'&message_sent=true')
    else:
      return redirect('/webapp/')
  else:
    return redirect('/webapp/')

def search(request):

  #Filters
  experience_minimal   = request.GET.get('experience_minimal')
  hour_rate_maximal    = request.GET.get('hour_rate_maximal')
  rating_minimal       = request.GET.get('rating_minimal')
  category_id          = request.GET.get('category_id')
  category_id          = int(category_id)

  district_id          = request.GET.get('district_id')
  district             = request.GET.get('district')
  expertise_ids        = request.GET.get('expertise')

  experts              = User.objects.all()
  expertieses          = Expertise.objects.filter(category_id=category_id)

  if experience_minimal:

    experts = experts.filter(category_id=category_id).filter(experience__gte=experience_minimal, hour_rate_to__lte=hour_rate_maximal, rating__gte=rating_minimal)

    if district_id == '':
      print "No Distiric ID"
    else:
      experts = experts.filter(district_id=district_id)

    if expertise_ids == '':
      print "No Expertise ID"
    else:

      eids = expertise_ids.split(",")

      for expert in experts:
        count = 0
        match = 0

        es =  expert.expertise.split(",")

        #Loop experties from search
        for eid in eids:
          count = count + 1

          #Loop experties from users
          for e in es:
            if eid == e:
              match = match + 1
            else:
              match = match

        if match != count:
          experts = experts.exclude(id = expert.id)


  else:
    experts = experts.filter(category_id=category_id)

  experts = experts.order_by('?')

  context = {
    'experts'             : experts,
    'category_id'         : category_id,
    'district_id'         : district_id,
    'district'            : district,
    'expertieses'         : expertieses,
    'expertise_ids'       : expertise_ids,
    'experience_minimal'  : experience_minimal,
    'hour_rate_maximal'   : hour_rate_maximal,
    'rating_minimal'      : rating_minimal
  }

  return render(request, 'webapp/search.html', context)

def expert(request):
  expert_id              = request.GET.get('id')
  message_sent           = request.GET.get('message_sent')
  rating_sent            = request.GET.get('rating_sent')
  expert                 = User.objects.get(id=expert_id)

  try:
    interview              = Interviews.objects.get(user_id=expert.id)
  except Interviews.DoesNotExist:
    interview = None

  #Convert Django List to string list
  expert_expertise       = expert.expertise
  expertieses            = ""

  if expert_expertise:
    expert_expertise     = expert_expertise.split(",")
    expertieses          = Expertise.objects.filter(id__in=map(str,expert_expertise))

  category_id            = expert.category_id
  district_id            = expert.district_id
  district               = expert.district

  #From original search
  experience_minimal     = request.GET.get('experience_minimal')
  hour_rate_maximal      = request.GET.get('hour_rate_maximal')
  rating_minimal         = request.GET.get('rating_minimal')
  expertise_ids          = request.GET.get('expertise')

  if experience_minimal == None or experience_minimal == "":
    experience_minimal = 1

  if hour_rate_maximal == None or hour_rate_maximal == "":
    hour_rate_maximal = 5000

  if rating_minimal == None or rating_minimal == "":
    rating_minimal = 1

  experts = User.objects.filter(category_id=category_id).filter(experience__gte=experience_minimal, hour_rate_to__lte=hour_rate_maximal, rating__gte=rating_minimal, district_id=district_id).exclude(id=expert_id)

  if expertise_ids:
    experts = experts.filter(expertise__icontains=expertise_ids)

  ratings = Rating.objects.filter(to_user=expert_id)

  context = {
    'expert'              : expert,
    'experts'             : experts,
    'category_id'         : category_id,
    'district_id'         : district_id,
    'district'            : district,
    'expertieses'         : expertieses,
    'expertise_ids'       : expertise_ids,
    'experience_minimal'  : experience_minimal,
    'hour_rate_maximal'   : hour_rate_maximal,
    'rating_minimal'      : rating_minimal,
    'ratings'             : ratings,
    'message_sent'        : message_sent,
    'rating_sent'         : rating_sent,
    'interview'           : interview
  }


  return render(request, 'webapp/expert.html', context)

@login_required
def remove_profile(request):
  user_id   = request.user.id
  expert    = User.objects.get(id=user_id)
  expert.delete()

  return redirect('/webapp/?expert_removed=true')


@login_required
def update_profile(request):
  expertieses  = Expertise.objects.all()

  if request.method == 'POST':

    user_id      = request.POST['user_id']

    #Only profile owner can edit profile
    if int(request.user.id) == int(user_id):

      instance     = User.objects.get(id=user_id)
      form         = RegistrationForm(request.POST, request.FILES, instance=instance)

      if form.is_valid():
        form.save()

        username   = form.cleaned_data['email']
        password   = form.cleaned_data['password1']

        #Log user in
        user       = authenticate(username = username, password = password)

        login(request, user)

        create_thumbnail(username)

        return redirect('/webapp/expert?id='+str(user_id))
      else:

        #invalid form
        #TODO: catch the form values and add condition to form to show them...

        form = RegistrationForm(request.POST)

        #print form.errors

        context = {
          'form'         : form,
          'expertieses'  : expertieses,
          'instance'     : instance
        }

        return render(request, 'registration/update_profile.html', context)

    else: # Not the profile owner
      return redirect('/webapp/expert?id='+str(user_id))
  else:

    form         = RegistrationForm(request.POST)
    user_id      = request.GET.get('id')
    instance     = User.objects.get(id=user_id)

    context = {
      'form'         : form,
      'expertieses'  : expertieses,
      'instance'     : instance
    }

    #Only profile owner can edit profile
    if int(request.user.id) == int(user_id):
      return render(request, 'registration/update_profile.html', context)
    else: # Not the profile owner

      return redirect('/webapp/expert?id='+str(user_id))

def create_thumbnail(username):
  #Thumbnail
  expert             = User.objects.get(email=username)
  profile_img_name   = expert.profile_img

  if profile_img_name != 'default.jpg':
    image              = Image.open(profile_img_name)
    image.thumbnail((500, 500))
    image.save(settings.MEDIA_ROOT + "/thumbs/"+str(profile_img_name), quality=100)

def register_client(request):
  if request.method == 'POST':
    form = RegistrationForm(request.POST, request.FILES)

    if form.is_valid():
      form.save()

      username   = form.cleaned_data['email']
      password   = form.cleaned_data['password1']

      #Log user in
      user       = authenticate(username = username, password = password)

      login(request, user)

      subject     = "New Client Registration on Local Experts"
      message     = "New client joined Local Experts. | Email: " + username
      from_email  = settings.EMAIL_HOST_USER
      password    = settings.EMAIL_HOST_PASSWORD
      to_list     = ['support@localexperts.cz']

      send_mail(subject, message, from_email, to_list, fail_silently=True)

      return redirect('/?just_registered=true')
    else:

      #print form.errors

      #When form   invalid
      form = RegistrationForm(request.POST)

      context     = {
        'form' : form
        }

      return render(request, 'registration/register_client.html', context)
  else:
    form        = RegistrationForm()

    context     = {
      'form' : form
    }

    return render(request, 'registration/register_client.html', context)


def register_expert(request):
  if request.method == 'POST':
    form = RegistrationForm(request.POST, request.FILES)

    if form.is_valid():
      form.save()

      username   = form.cleaned_data['email']
      password   = form.cleaned_data['password1']

      #Log user in
      user       = authenticate(username = username, password = password)

      login(request, user)
      create_thumbnail(username)

      subject     = "New Expert Registration on Local Experts"
      message     = "New expert joined Local Experts. | Email: " + username + " | Category_id: " + str(user.category_id) + " | District: " + user.district
      from_email  = settings.EMAIL_HOST_USER
      password    = settings.EMAIL_HOST_PASSWORD
      to_list     = ['support@localexperts.cz']

      send_mail(subject, message, from_email, to_list, fail_silently=True)

      return redirect('/webapp/expert?id='+str(user.id))
    else:

      #When form   invalid
      form = RegistrationForm(request.POST)
      expertieses = Expertise.objects.all()

      context     = {
        'form' : form,
        'expertieses' : expertieses
        }

      return render(request, 'registration/register_expert.html', context)
  else:
    form        = RegistrationForm()
    expertieses = Expertise.objects.all()

    context     = {
      'form' : form,
      'expertieses' : expertieses
    }

    return render(request, 'registration/register_expert.html', context)

def register(request):
  return render(request, 'registration/register.html')


